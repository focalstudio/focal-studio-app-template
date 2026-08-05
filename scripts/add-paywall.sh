#!/bin/bash
# Usage: bash scripts/add-paywall.sh <revenuecat> [--force]
#
# Wires a paywall provider into this app:
#   1. Installs the provider's packages
#   2. Copies its PaywallProvider adapter into src/services/paywall/
#   3. Points src/services/paywall/index.ts at it
#   4. Promotes its env vars from optional to required in env.js
#   5. Uncomments the vars in .env.example
#
# Everything the script cannot do safely — creating the RevenueCat project,
# configuring products in App Store Connect, editing app.json — is printed at
# the end as explicit manual steps.
#
# The provider argument is kept even though there is only one option today: the
# usage text stays honest, and a future adapty/superwall adapter drops into the
# same shape without changing the call site.
#
# Structurally smoke-tested by .github/workflows/template-backend-smoke-test.yml
# on every PR that touches this file.

set -euo pipefail

PROVIDER="${1:-}"
FORCE="${2:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$PROVIDER" != "revenuecat" ]; then
  echo "Usage: bash scripts/add-paywall.sh <revenuecat> [--force]"
  echo
  echo "  revenuecat  In-app purchases and subscriptions via RevenueCat."
  echo "              Adds native code — needs a dev client, not Expo Go."
  echo
  echo "See docs/paywall/<provider>.md for what this involves."
  exit 1
fi

SRC_DIR="templates/paywall"
DEST="src/services/paywall/$PROVIDER.ts"

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: $SRC_DIR not found. Is this the app template repo root?"
  exit 1
fi

# Refuse to clobber an adapter that may already have local edits — the
# ENTITLEMENT_ID and PRODUCT_TIERS block at the top of it is meant to be edited.
if [ -f "$DEST" ] && [ "$FORCE" != "--force" ]; then
  echo "Error: $DEST already exists."
  echo
  echo "This app looks like it already has the $PROVIDER paywall wired."
  echo "Re-run with --force to overwrite it (your ENTITLEMENT_ID and"
  echo "PRODUCT_TIERS edits in that file will be lost)."
  exit 1
fi

echo "==> Wiring the $PROVIDER paywall"
echo

# ---------------------------------------------------------------------------
# 1. Packages
# ---------------------------------------------------------------------------
# --legacy-peer-deps is mandatory throughout this repo (jest-expo peer
# conflict); see VERSIONS.md.
has_dep() {
  node -e "const d=require('./package.json').dependencies||{};process.exit(d['$1']?0:1)"
}

echo "==> Installing packages"
# `expo install` picks the version matching this SDK, but exits non-zero when it
# wants to write into a dynamic app.config.js and cannot. The package still
# installs, so verify by result rather than by exit code.
#
# There is genuinely nothing to add to app.json here: react-native-purchases
# ships no `app.plugin.js` and is a classic autolinked native module. Do NOT add
# a plugin entry — it will fail the build. The `|| true` is guarding against
# expo install's dynamic-config exit code, not working around a missing plugin.
#
# The bare `--` is required: `expo install` parses its own flags first and
# rejects `--legacy-peer-deps` outright, so everything after `--` is what gets
# forwarded to npm.
npx expo install react-native-purchases -- --legacy-peer-deps || true
if ! has_dep react-native-purchases; then
  echo
  echo "Error: react-native-purchases failed to install. The adapter cannot"
  echo "work without it. Try:"
  echo "    npx expo install react-native-purchases -- --legacy-peer-deps"
  exit 1
fi
echo

# ---------------------------------------------------------------------------
# 2. Adapter
# ---------------------------------------------------------------------------
echo "==> Installing adapter → $DEST"
cp "$SRC_DIR/$PROVIDER.ts" "$DEST"

# The adapter's contract tests ride along with it.
#
# They live beside the adapter in templates/ but are written against their
# destination — `../$PROVIDER`, `../types` and `../errors` only resolve once
# they are here. jest.config.js excludes /templates/ from testMatch for exactly
# that reason, so this copy is the only thing that ever makes them runnable.
#
# They also carry the only check that src/services/paywall/errors.ts agrees with
# the SDK's real PURCHASES_ERROR_CODE enum — that table lives in src/ for CI
# coverage, which means it cannot import the enum to check itself.
if [ -f "$SRC_DIR/$PROVIDER.test.ts" ]; then
  TEST_DEST="src/services/paywall/__tests__/$PROVIDER.test.ts"
  echo "==> Installing adapter tests → $TEST_DEST"
  mkdir -p "$(dirname "$TEST_DEST")"
  cp "$SRC_DIR/$PROVIDER.test.ts" "$TEST_DEST"
fi

# ---------------------------------------------------------------------------
# 3. Point the port at it
# ---------------------------------------------------------------------------
echo "==> Activating the provider in src/services/paywall/index.ts"
INDEX="src/services/paywall/index.ts"

python3 - "$INDEX" "$PROVIDER" <<'PY'
import re, sys

path, provider = sys.argv[1], sys.argv[2]
src = open(path).read()

export_name = f"{provider}PaywallProvider"

# Swap the import of the local scaffold for the chosen provider.
src = re.sub(
    r'import \{ \w+PaywallProvider \} from "\./\w+";',
    f'import {{ {export_name} }} from "./{provider}";',
    src,
    count=1,
)

# Swap the single assignment that decides the active provider.
src = re.sub(
    r'export const paywallProvider: PaywallProvider = \w+;',
    f'export const paywallProvider: PaywallProvider = {export_name};',
    src,
    count=1,
)

open(path, "w").write(src)
PY

if ! grep -q "${PROVIDER}PaywallProvider" "$INDEX"; then
  echo "Error: failed to activate the provider in $INDEX."
  echo "Edit it by hand — it is a two-line change (the import and the export)."
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Make the provider's env vars required
# ---------------------------------------------------------------------------
# env.js keys its superRefine off this constant. It is deliberately a separate
# constant from BACKEND, and this regex is anchored on PAYWALL so the two
# scripts cannot clobber one another — the smoke-test workflow asserts that by
# running both and checking each constant survived.
echo "==> Setting PAYWALL = \"$PROVIDER\" in env.js"
python3 - "$PROVIDER" <<'PY'
import re, sys
provider = sys.argv[1]
src = open("env.js").read()
src = re.sub(r'const PAYWALL = "\w+";', f'const PAYWALL = "{provider}";', src, count=1)
open("env.js", "w").write(src)
PY

if ! grep -q "const PAYWALL = \"$PROVIDER\";" env.js; then
  echo "Error: failed to set PAYWALL in env.js. Edit that one line by hand."
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Uncomment the provider's block in .env.example
# ---------------------------------------------------------------------------
echo "==> Uncommenting $PROVIDER variables in .env.example"
python3 - <<'PY'
import re
lines = open(".env.example").read().splitlines()
out = [re.sub(r'^# (EXPO_PUBLIC_REVENUECAT_\w+=)', r'\1', line) for line in lines]
open(".env.example", "w").write("\n".join(out) + "\n")
PY

echo
echo "==> Done. Files changed:"
echo "      $DEST                            (new)"
echo "      src/services/paywall/__tests__/$PROVIDER.test.ts (new)"
echo "      src/services/paywall/index.ts    (provider activated)"
echo "      env.js                           (PAYWALL = \"$PROVIDER\")"
echo "      .env.example                     ($PROVIDER vars uncommented)"
echo "      package.json                     (dependencies)"
echo

# ---------------------------------------------------------------------------
# Manual steps
# ---------------------------------------------------------------------------
cat <<'EOF'
============================================================
 Remaining manual steps
============================================================

1. Create a project at https://app.revenuecat.com

2. Add your iOS app. Copy the **public** SDK key (not the secret API key)
   into .env.local:
     EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...

   Add the Android key too if you ship on Play:
     EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...

   env.js rejects a key with the wrong prefix, so a swapped pair fails the
   build instead of failing at runtime as "invalid credentials".

3. **App Store Connect: put every subscription in ONE subscription group.**
   Monthly and annual in separate groups lets a user hold both at once, makes
   an "upgrade" double-charge them, and makes the reported tier flip between
   the two. This is not recoverable after people have subscribed.

4. **App Store Connect: create an In-App Purchase Key (.p8) and set the
   App Store Server Notifications URL**, both in RevenueCat's iOS app settings.
   Without them RevenueCat never learns about renewals, expiries or refunds:
   the entitlement listener goes permanently silent, an expired user keeps Pro
   forever, and it all looks like a bug in this code.

5. Create a `pro` entitlement in RevenueCat and attach your products to it.
   If you use a different identifier, change ENTITLEMENT_ID at the top of
   src/services/paywall/revenuecat.ts.

6. Create an offering, mark it **current**, and add the standard packages
   ($rc_monthly / $rc_annual / $rc_lifetime). Name products so they end in a
   tier token and nothing else is needed:
     <bundleId>.pro.monthly / .annual / .lifetime
   Otherwise map them in PRODUCT_TIERS at the top of the adapter.

7. Build a dev client — purchases do NOT work in Expo Go:
     npx expo prebuild
     npx expo run:ios
   (Expo Go falls back to RevenueCat's Preview API Mode, which returns stub
   offerings and cannot complete a purchase.)

8. Test with a sandbox tester account, or a StoreKit configuration file in
   Xcode for local-only testing.

NOTE: react-native-purchases needs NO entry in app.json. It ships no config
plugin and is autolinked. Adding one will break the build.

Then verify:
     npm run type-check && npm run lint && npm test
     npx expo run:ios

Full guide: docs/paywall/revenuecat.md
============================================================
EOF
