#!/bin/bash
# Usage: bash scripts/bump-version.sh 1.2.3
# Updates package.json and app.json to the specified version.

set -e

if [ -z "$1" ]; then
  echo "Usage: bash scripts/bump-version.sh <version>"
  echo "Example: bash scripts/bump-version.sh 1.2.3"
  exit 1
fi

VERSION="$1"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: version must be in semver format (e.g. 1.2.3)"
  exit 1
fi

echo "Bumping version to $VERSION..."

# Update package.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

# Update app.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" app.json

# Update TEMPLATE_VERSION — but only in the template itself.
#
# In the template this file records the template's own version, so it moves with
# every bump. In a GENERATED APP it records which template release that app last
# adopted, and bumping the app's version must not touch it — the app going 1.2.0
# to 1.3.0 says nothing about which template it is on. The `[APP_NAME]` tell in
# app.json is the same bootstrap gate maestro-e2e.yml and drift-report.sh use.
if grep -q '\[APP_NAME\]' app.json 2>/dev/null; then
  printf '%s\n' "$VERSION" > TEMPLATE_VERSION
  TEMPLATE_VERSION_NOTE="  TEMPLATE_VERSION: $VERSION"
else
  TEMPLATE_VERSION_NOTE="  TEMPLATE_VERSION: $(cat TEMPLATE_VERSION 2>/dev/null || echo '(absent)') (unchanged — this is a generated app)"
fi

# NOTE: src/constants.ts is deliberately NOT edited here. APP_VERSION and
# DEV_MODE_KEY are derived from package.json at build time, so they track this
# bump automatically. The previous sed-based approach used GNU-only `\+` syntax
# under BSD sed, matched nothing on macOS, and silently shipped a stale
# DEV_MODE_KEY — hence the hard verification below.

# Verify the substitutions actually applied. sed exits 0 even when it matches
# nothing, so `set -e` alone cannot catch a broken pattern.
PKG_VERSION=$(node -p "require('./package.json').version")
APP_JSON_VERSION=$(node -p "require('./app.json').expo.version")

if [ "$PKG_VERSION" != "$VERSION" ] || [ "$APP_JSON_VERSION" != "$VERSION" ]; then
  echo "Error: version bump did not apply cleanly."
  echo "  expected:     $VERSION"
  echo "  package.json: $PKG_VERSION"
  echo "  app.json:     $APP_JSON_VERSION"
  exit 1
fi

echo "Done. Verified:"
echo "  package.json: $PKG_VERSION"
echo "  app.json:     $APP_JSON_VERSION"
echo "  src/constants.ts: APP_VERSION + DEV_MODE_KEY derived from package.json (not edited)"
echo "$TEMPLATE_VERSION_NOTE"
echo ""
echo "Next: move ## [Unreleased] in CHANGELOG.md to ## [$VERSION] — $(date +%Y-%m-%d)"
