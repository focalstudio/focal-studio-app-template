#!/bin/bash
# Usage: bash scripts/add-backend.sh <supabase|firebase> [--force]
#
# Wires an auth backend into this app:
#   1. Installs the provider's packages
#   2. Copies its AuthProvider adapter into src/services/auth/
#   3. Points src/services/auth/index.ts at it
#   4. Promotes its env vars from optional to required in env.js
#   5. Appends the vars to .env.example
#
# Everything the script cannot do safely — creating the project, applying SQL,
# editing app.json — is printed at the end as explicit manual steps.
#
# Structurally smoke-tested by .github/workflows/template-backend-smoke-test.yml
# on every PR that touches this file. That workflow's `paths:` filter lists this
# path first, so any change here is covered.

set -euo pipefail

PROVIDER="${1:-}"
FORCE="${2:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$PROVIDER" != "supabase" ] && [ "$PROVIDER" != "firebase" ]; then
  echo "Usage: bash scripts/add-backend.sh <supabase|firebase> [--force]"
  echo
  echo "  supabase  Postgres + auth + storage. Recommended default."
  echo "  firebase  Firebase JS SDK path (works in Expo Go, no config plugin)."
  echo
  echo "See docs/backends/<provider>.md for what each one involves."
  exit 1
fi

SRC_DIR="templates/backends/$PROVIDER"
DEST="src/services/auth/$PROVIDER.ts"

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: $SRC_DIR not found. Is this the app template repo root?"
  exit 1
fi

# Refuse to clobber an adapter that may already have local edits.
if [ -f "$DEST" ] && [ "$FORCE" != "--force" ]; then
  echo "Error: $DEST already exists."
  echo
  echo "This app looks like it already has the $PROVIDER backend wired."
  echo "Re-run with --force to overwrite it (your local changes to that file"
  echo "will be lost)."
  exit 1
fi

# Guard against wiring two providers at once — the port allows exactly one.
OTHER=$([ "$PROVIDER" = "supabase" ] && echo "firebase" || echo "supabase")
if [ -f "src/services/auth/$OTHER.ts" ] && [ "$FORCE" != "--force" ]; then
  echo "Error: this app already has the $OTHER backend wired."
  echo
  echo "Remove src/services/auth/$OTHER.ts and its packages first, or re-run"
  echo "with --force. Only one provider can be active at a time."
  exit 1
fi

echo "==> Wiring the $PROVIDER backend"
echo

# ---------------------------------------------------------------------------
# 1. Packages
# ---------------------------------------------------------------------------
# --legacy-peer-deps is mandatory throughout this repo (jest-expo peer
# conflict); see VERSIONS.md. `expo install` picks SDK-compatible versions for
# Expo-ecosystem packages, so it is used where it applies.
has_dep() {
  node -e "const d=require('./package.json').dependencies||{};process.exit(d['$1']?0:1)"
}

echo "==> Installing packages"
if [ "$PROVIDER" = "supabase" ]; then
  npm install @supabase/supabase-js react-native-url-polyfill --legacy-peer-deps

  # `expo install` picks the version matching this SDK, but exits non-zero when
  # it wants to add a config plugin to a dynamic app.config.js and cannot write
  # to it. The package still installs. We do not want that plugin entry anyway:
  # expo-sqlite is autolinked, and its plugin only configures build options like
  # SQLCipher or FTS that the localStorage shim does not use. So verify by
  # result rather than exit code — and never edit app.json behind your back.
  npx expo install expo-sqlite || true
  if ! has_dep expo-sqlite; then
    echo
    echo "Error: expo-sqlite failed to install. It backs the auth session store,"
    echo "so the adapter cannot work without it. Try:"
    echo "    npx expo install expo-sqlite"
    exit 1
  fi
else
  npm install firebase --legacy-peer-deps
  if ! has_dep firebase; then
    echo "Error: firebase failed to install."
    exit 1
  fi
fi
echo

# ---------------------------------------------------------------------------
# 2. Adapter
# ---------------------------------------------------------------------------
echo "==> Installing adapter → $DEST"
cp "$SRC_DIR/$PROVIDER.ts" "$DEST"

# ---------------------------------------------------------------------------
# 3. Point the port at it
# ---------------------------------------------------------------------------
echo "==> Activating the provider in src/services/auth/index.ts"
INDEX="src/services/auth/index.ts"

python3 - "$INDEX" "$PROVIDER" <<'PY'
import re, sys

path, provider = sys.argv[1], sys.argv[2]
src = open(path).read()

export_name = f"{provider}AuthProvider"

# Swap the import of the local scaffold for the chosen provider.
src = re.sub(
    r'import \{ \w+AuthProvider \} from "\./\w+";',
    f'import {{ {export_name} }} from "./{provider}";',
    src,
    count=1,
)

# Swap the single assignment that decides the active backend.
src = re.sub(
    r'export const authProvider: AuthProvider = \w+;',
    f'export const authProvider: AuthProvider = {export_name};',
    src,
    count=1,
)

open(path, "w").write(src)
PY

if ! grep -q "${PROVIDER}AuthProvider" "$INDEX"; then
  echo "Error: failed to activate the provider in $INDEX."
  echo "Edit it by hand — it is a two-line change (the import and the export)."
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Make the provider's env vars required
# ---------------------------------------------------------------------------
# env.js keys its superRefine off this constant, so flipping it turns the
# provider's variables from optional into build-time requirements.
echo "==> Setting BACKEND = \"$PROVIDER\" in env.js"
python3 - "$PROVIDER" <<'PY'
import re, sys
provider = sys.argv[1]
src = open("env.js").read()
src = re.sub(r'const BACKEND = "\w+";', f'const BACKEND = "{provider}";', src, count=1)
open("env.js", "w").write(src)
PY

# ---------------------------------------------------------------------------
# 5. Uncomment the provider's block in .env.example
# ---------------------------------------------------------------------------
echo "==> Uncommenting $PROVIDER variables in .env.example"
python3 - "$PROVIDER" <<'PY'
import re, sys
provider = sys.argv[1]
prefix = "EXPO_PUBLIC_SUPABASE_" if provider == "supabase" else "EXPO_PUBLIC_FIREBASE_"

lines = open(".env.example").read().splitlines()
out = [re.sub(r'^# (' + prefix + r'\w+=)', r'\1', line) for line in lines]
open(".env.example", "w").write("\n".join(out) + "\n")
PY

echo
echo "==> Done. Files changed:"
echo "      $DEST                        (new)"
echo "      src/services/auth/index.ts   (provider activated)"
echo "      env.js                       (BACKEND = \"$PROVIDER\")"
echo "      .env.example                 ($PROVIDER vars uncommented)"
echo "      package.json                 (dependencies)"
echo

# ---------------------------------------------------------------------------
# Manual steps
# ---------------------------------------------------------------------------
cat <<EOF
============================================================
 Remaining manual steps
============================================================
EOF

if [ "$PROVIDER" = "supabase" ]; then
  cat <<'EOF'

1. Create a project at https://supabase.com/dashboard

2. Project Settings -> API. Copy into .env.local:
     EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
     EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

   (Older docs call this the "anon key". It is safe to ship in the client —
   Row Level Security, not key secrecy, is what protects your data.)

3. Apply the schema. SQL Editor -> paste and run:
     templates/backends/supabase/schema.sql

   This creates profiles, RLS policies, the signup trigger, and the
   delete_own_account() function that account deletion depends on.

4. Verify RLS is actually enabled — a table with policies but RLS off is
   wide open, and the dashboard does not warn you:
     select relname, relrowsecurity from pg_class where relname = 'profiles';

5. Auth -> Providers -> Email: decide whether "Confirm email" stays on.
   With it on, signUp() returns no session and the app tells the user to
   check their inbox. That path is already handled.

EOF
else
  cat <<'EOF'

1. Create a project at https://console.firebase.google.com

2. Add a Web app (even for a mobile app — this is the JS SDK path).
   Project settings -> Your apps -> SDK setup. Copy into .env.local:
     EXPO_PUBLIC_FIREBASE_API_KEY=...
     EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
     EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
     EXPO_PUBLIC_FIREBASE_APP_ID=...

3. Authentication -> Sign-in method -> enable Email/Password.

4. Account deletion removes the auth user but NOT Firestore or Storage data.
   Before answering Play's Data safety form, add either:
     - a Cloud Function triggered on user delete, or
     - the "Delete User Data" Firebase Extension.

   You must verify it actually runs. Deleting an auth user while their data
   remains is exactly what the Data safety requirement exists to prevent.

NOTE: this installed the Firebase JS SDK, which needs no config plugin and
runs in Expo Go. If you later need Analytics, Crashlytics, or FCM, migrate to
@react-native-firebase — that requires a dev client, plugin entries in
app.json, and forceStaticLinking on this template's SDK 56 / RN 0.85.
See docs/backends/firebase.md.

EOF
fi

cat <<EOF
Then verify:
     npm run type-check && npm run lint && npm test
     npx expo start --ios

Full guide: docs/backends/$PROVIDER.md
============================================================
EOF
