#!/bin/bash
# Usage: bash scripts/add-social-auth.sh
#
# Adds Sign in with Apple to an app that already has the Supabase backend:
#   1. Installs expo-apple-authentication
#   2. Copies the social module into src/services/auth/social.ts
#   3. Composes it onto the active provider in src/services/auth/index.ts
#
# It deliberately does NOT touch the adapter (src/services/auth/supabase.ts) —
# that file is yours to edit, and a script that regex-patches a file you may
# have customised is a script that eventually mangles one. Everything it cannot
# do safely — app.json, Apple Developer, the Supabase dashboard — is printed at
# the end as explicit manual steps.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ADAPTER="src/services/auth/supabase.ts"
DEST="src/services/auth/social.ts"
SRC="templates/social/supabase-social.ts"
INDEX="src/services/auth/index.ts"

# ---------------------------------------------------------------------------
# Guards — nothing is mutated above this line
# ---------------------------------------------------------------------------
if [ ! -f "$SRC" ]; then
  echo "Error: $SRC not found. Is this the app template repo root?"
  exit 1
fi

if [ ! -f "$ADAPTER" ]; then
  echo "Error: $ADAPTER not found."
  echo
  echo "Social sign-in composes onto a backend, so wire one first:"
  echo "    bash scripts/add-backend.sh supabase"
  echo
  echo "Firebase is not supported by this script yet — see docs/backends/firebase.md."
  exit 1
fi

if [ -f "$DEST" ]; then
  echo "Error: $DEST already exists."
  echo
  echo "This app looks like it already has social sign-in wired. To reinstall,"
  echo "delete that file first (your local changes to it will be lost):"
  echo "    rm $DEST"
  exit 1
fi

echo "==> Adding Sign in with Apple (Supabase)"
echo

# ---------------------------------------------------------------------------
# 1. Package
# ---------------------------------------------------------------------------
# `expo install` picks the version matching this SDK. It can exit non-zero when
# it wants to add a config plugin to a dynamic app.config.js and cannot write to
# it — the package still installs, and we print the plugin step below rather
# than editing app.json behind your back. So verify by result, not exit code.
has_dep() {
  node -e "const d=require('./package.json').dependencies||{};process.exit(d['$1']?0:1)"
}

#
# `expo install` evaluates app.config.js, which runs env.js — and by the time
# this script runs, add-backend.sh has already set BACKEND, so validation fails
# hard until .env.local exists. (add-backend.sh only avoids this by installing
# its packages *before* it flips BACKEND.) Refusing to run until the app has
# real credentials would be wrong: choosing your sign-in methods is a decision
# you make well before you have a Supabase project. So when validation is
# failing, feed the install placeholders — scoped to this one command, written
# nowhere, and never used by the app.
echo "==> Installing expo-apple-authentication"

# `expo install` picks the SDK-compatible version, then shells out to npm.
# Everything in this repo installs with --legacy-peer-deps (the jest-expo peer
# conflict; see VERSIONS.md), and args after `--` are forwarded to npm.
install_apple_auth() {
  npx expo install expo-apple-authentication -- --legacy-peer-deps
}

if node -e "require('./env.js')" >/dev/null 2>&1; then
  install_apple_auth || true
else
  echo "    (env.js validation is failing — no .env.local yet. Using placeholder"
  echo "     values for this install only; nothing is written to disk.)"
  EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}" \
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_placeholder}" \
    install_apple_auth || true
fi

if ! has_dep expo-apple-authentication; then
  echo
  echo "Error: expo-apple-authentication failed to install. Try:"
  echo "    npx expo install expo-apple-authentication"
  exit 1
fi
echo

# ---------------------------------------------------------------------------
# 2. Module
# ---------------------------------------------------------------------------
echo "==> Installing social module → $DEST"
cp "$SRC" "$DEST"

# ---------------------------------------------------------------------------
# 3. Compose it onto the active provider
# ---------------------------------------------------------------------------
# index.ts is a 15-line generated file that add-backend.sh already rewrites, so
# patching it is safe in a way that patching the adapter would not be.
echo "==> Composing socialAuth in $INDEX"

python3 - "$INDEX" <<'PY'
import re, sys

path = sys.argv[1]
src = open(path).read()

if "socialAuth" not in src:
    src = re.sub(
        r'(import \{ \w+AuthProvider \} from "\./\w+";)',
        r'\1\nimport { socialAuth } from "./social";',
        src,
        count=1,
    )
    src = re.sub(
        r'export const authProvider: AuthProvider = (\w+);',
        r'export const authProvider: AuthProvider = { ...\1, ...socialAuth };',
        src,
        count=1,
    )
    open(path, "w").write(src)
PY

if ! grep -q "socialAuth" "$INDEX"; then
  echo "Error: failed to compose socialAuth in $INDEX."
  echo
  echo "Edit it by hand — it is a two-line change:"
  echo '    import { socialAuth } from "./social";'
  echo '    export const authProvider: AuthProvider = { ...supabaseAuthProvider, ...socialAuth };'
  exit 1
fi

echo
echo "==> Done. Files changed:"
printf '      %-28s %s\n' "$DEST" "(new)"
printf '      %-28s %s\n' "$INDEX" "(socialAuth composed on)"
printf '      %-28s %s\n' "package.json" "(expo-apple-authentication)"
echo

# ---------------------------------------------------------------------------
# Manual steps
# ---------------------------------------------------------------------------
cat <<'EOF'
============================================================
 This adds native code
============================================================

Sign in with Apple is a native module with a config plugin. Two consequences,
both of which bite immediately if you miss them:

  - This app will NO LONGER RUN IN EXPO GO. Build a development client:
        npx expo run:ios
        # or: eas build --profile development --platform ios

  - The EAS build cache is invalidated. Your next build is a cold one.

============================================================
 Remaining manual steps
============================================================

1. app.json — add the config plugin:

     "plugins": [
       ...
       "expo-apple-authentication"
     ]

   and the iOS entitlement:

     "ios": {
       ...
       "usesAppleSignIn": true
     }

   Without usesAppleSignIn your build fails App Store validation at upload
   time, not at runtime — so you find out at the worst possible moment.

2. Apple Developer -> Certificates, Identifiers & Profiles -> Identifiers
   -> your App ID -> enable "Sign In with Apple".

   That is all you need for the native iOS flow. A Services ID, a Key, and a
   Return URL are only required for the web/Android flow, which this recipe
   does not ship.

   The entitlement change invalidates your provisioning profile. Let EAS
   regenerate it (`eas build` will offer), or re-sync in Xcode.

3. Supabase -> Authentication -> Providers -> Apple -> enable, then put your
   iOS bundle identifier in the "Client IDs" field.

   This is the step everyone misses. Without it signInWithIdToken fails with
   "Unacceptable audience in id_token" and it is not obvious why.

4. Verify:
     npm run type-check && npm run lint && npm test
     npx expo run:ios

   Then on a real device or simulator: tap "Continue with Apple", complete the
   sheet, and confirm you land in the app. Cancel the sheet and confirm NO
   error appears — that is the intended behaviour.

Full guide: docs/backends/supabase.md
============================================================
EOF
