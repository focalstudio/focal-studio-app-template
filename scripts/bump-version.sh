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

# Update DEV_MODE_KEY in src/constants.ts
sed -i '' "s/dev_mode_[0-9]\+\.[0-9]\+\.[0-9]\+/dev_mode_$VERSION/" src/constants.ts

echo "Done. Verify:"
echo "  package.json: $(node -p "require('./package.json').version")"
echo "  app.json:     $(node -p "require('./app.json').expo.version")"
echo ""
echo "Next: move ## [Unreleased] in CHANGELOG.md to ## [$VERSION] — $(date +%Y-%m-%d)"
