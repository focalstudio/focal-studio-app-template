#!/bin/bash
# Usage: bash scripts/add-social-auth.sh
#
# Adds Sign in with Apple to an app that already has a backend wired:
#   1. Detects which backend is active (Supabase or Firebase)
#   2. Installs that backend's Apple sign-in packages
#   3. Copies the matching social module into src/services/auth/social.ts
#   4. Composes it onto the active provider in src/services/auth/index.ts
#
# It deliberately does NOT touch the adapter (src/services/auth/<backend>.ts) —
# that file is yours to edit, and a script that regex-patches a file you may
# have customised is a script that eventually mangles one. Everything it cannot
# do safely — app.json, Apple Developer, the provider's dashboard — is printed
# at the end as explicit manual steps.
#
# Structurally smoke-tested by .github/workflows/template-backend-smoke-test.yml
# on every PR that touches this file, for both backends.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEST="src/services/auth/social.ts"
INDEX="src/services/auth/index.ts"

# ---------------------------------------------------------------------------
# Guards — nothing is mutated above this line
# ---------------------------------------------------------------------------

# Which backend is wired? add-backend.sh allows exactly one at a time, so the
# adapter file that exists *is* the answer — no argument needed, and no way for
# the caller to pick a backend the app isn't actually running.
SUPABASE_ADAPTER="src/services/auth/supabase.ts"
FIREBASE_ADAPTER="src/services/auth/firebase.ts"

if [ -f "$SUPABASE_ADAPTER" ] && [ -f "$FIREBASE_ADAPTER" ]; then
  echo "Error: both a Supabase and a Firebase adapter are present."
  echo
  echo "The port supports exactly one backend at a time. Remove whichever of"
  echo "these you are not using, then re-run:"
  echo "    $SUPABASE_ADAPTER"
  echo "    $FIREBASE_ADAPTER"
  exit 1
elif [ -f "$SUPABASE_ADAPTER" ]; then
  BACKEND="supabase"
  ADAPTER="$SUPABASE_ADAPTER"
  PACKAGES="expo-apple-authentication"
elif [ -f "$FIREBASE_ADAPTER" ]; then
  BACKEND="firebase"
  ADAPTER="$FIREBASE_ADAPTER"
  # expo-crypto generates the nonce Firebase's Apple credential requires.
  PACKAGES="expo-apple-authentication expo-crypto"
else
  echo "Error: no auth adapter found in src/services/auth/."
  echo
  echo "Social sign-in composes onto a backend, so wire one first:"
  echo "    bash scripts/add-backend.sh supabase"
  echo "    bash scripts/add-backend.sh firebase"
  exit 1
fi

SRC="templates/social/$BACKEND-social.ts"

if [ ! -f "$SRC" ]; then
  echo "Error: $SRC not found. Is this the app template repo root?"
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

# The Firebase social module reuses the adapter's session and error mapping
# rather than duplicating it. Those two helpers were module-private until the
# Apple recipe landed, so an adapter copied out of an older template will not
# export them — and the failure would otherwise be a type error in a file this
# repo's CI cannot even see. Refuse now, with the fix, instead of patching an
# adapter the script has always promised not to touch.
if [ "$BACKEND" = "firebase" ] && ! grep -q "export async function toAuthSession" "$ADAPTER"; then
  echo "Error: $ADAPTER predates the Apple sign-in recipe."
  echo
  echo "social.ts imports the adapter's session and error mapping. Add the"
  echo "missing 'export' keyword to both of these, then re-run:"
  echo "    async function toAuthSession(  ->  export async function toAuthSession("
  echo "    function toAuthError(          ->  export function toAuthError("
  exit 1
fi

echo "==> Adding Sign in with Apple ($BACKEND)"
echo

# ---------------------------------------------------------------------------
# 1. Packages
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
# you make well before you have a project. So when validation is failing, feed
# the install placeholders — scoped to this one command, written nowhere, and
# never used by the app.
echo "==> Installing $PACKAGES"

# `expo install` picks the SDK-compatible version, then shells out to npm.
# Everything in this repo installs with --legacy-peer-deps (the jest-expo peer
# conflict; see VERSIONS.md), and args after `--` are forwarded to npm.
install_packages() {
  # shellcheck disable=SC2086 # PACKAGES is a deliberate word-split list.
  npx expo install $PACKAGES -- --legacy-peer-deps
}

if node -e "require('./env.js')" >/dev/null 2>&1; then
  install_packages || true
elif [ "$BACKEND" = "supabase" ]; then
  echo "    (env.js validation is failing — no .env.local yet. Using placeholder"
  echo "     values for this install only; nothing is written to disk.)"
  EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}" \
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_placeholder}" \
    install_packages || true
else
  echo "    (env.js validation is failing — no .env.local yet. Using placeholder"
  echo "     values for this install only; nothing is written to disk.)"
  # AUTH_DOMAIN is optional in env.js, so the three required vars are enough.
  EXPO_PUBLIC_FIREBASE_API_KEY="${EXPO_PUBLIC_FIREBASE_API_KEY:-placeholder-key}" \
  EXPO_PUBLIC_FIREBASE_PROJECT_ID="${EXPO_PUBLIC_FIREBASE_PROJECT_ID:-placeholder-project}" \
  EXPO_PUBLIC_FIREBASE_APP_ID="${EXPO_PUBLIC_FIREBASE_APP_ID:-1:000000000000:web:placeholder}" \
    install_packages || true
fi

for pkg in $PACKAGES; do
  if ! has_dep "$pkg"; then
    echo
    echo "Error: $pkg failed to install. Try:"
    echo "    npx expo install $pkg"
    exit 1
  fi
done
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
  echo "    export const authProvider: AuthProvider = { ...${BACKEND}AuthProvider, ...socialAuth };"
  exit 1
fi

echo
echo "==> Done. Files changed:"
printf '      %-28s %s\n' "$DEST" "(new)"
printf '      %-28s %s\n' "$INDEX" "(socialAuth composed on)"
printf '      %-28s %s\n' "package.json" "($PACKAGES)"
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
EOF

if [ "$BACKEND" = "firebase" ]; then
  cat <<'EOF'

  Note for the Firebase JS SDK path specifically: running in Expo Go with no
  config plugin is the main reason to be on that path rather than React Native
  Firebase. Adding Apple sign-in spends that advantage. If you were staying on
  the JS SDK for Expo Go alone, re-read the comparison in
  docs/backends/firebase.md before you continue.
EOF
fi

cat <<'EOF'

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
EOF

if [ "$BACKEND" = "supabase" ]; then
  cat <<'EOF'

3. Supabase -> Authentication -> Providers -> Apple -> enable, then put your
   iOS bundle identifier in the "Client IDs" field.

   This is the step everyone misses. Without it signInWithIdToken fails with
   "Unacceptable audience in id_token" and it is not obvious why.
EOF
else
  cat <<'EOF'

3. Firebase Console -> Authentication -> Sign-in method -> Apple -> Enable,
   then Save.

   Leave Services ID, Apple team ID, Key ID and Private key BLANK. Those are
   only for the web/Android OAuth flow. The native iOS flow this recipe ships
   verifies the identity token directly, and filling them in for iOS-only is a
   common way to break a working setup.
EOF
fi

cat <<'EOF'

4. Verify:
     npm run type-check && npm run lint && npm test
     npx expo run:ios

   Then on a real device or simulator: tap "Continue with Apple", complete the
   sheet, and confirm you land in the app. Cancel the sheet and confirm NO
   error appears — that is the intended behaviour.
EOF

echo
echo "Full guide: docs/backends/$BACKEND.md"
echo "============================================================"
