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
echo ""
echo "Next: move ## [Unreleased] in CHANGELOG.md to ## [$VERSION] — $(date +%Y-%m-%d)"
