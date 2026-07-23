#!/bin/sh
set -e

# Xcode Cloud auto-discovers this hook by name and runs it after xcodebuild.
# Guardrail against the silent "archive ships without a JS bundle" failure class:
# if the Bundle React Native build phase ever no-ops again (e.g. NODE_BINARY not
# resolved), the archive builds "successfully" but crashes instantly at launch with
# "No script URL provided". Fail the build loudly HERE so it can never reach TestFlight.

# Only inspect archive actions; other build actions (tests, analyze) have no archive.
if [ -z "$CI_ARCHIVE_PATH" ]; then
  exit 0
fi

APP_DIR="$(find "$CI_ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' -type d | head -1)"
BUNDLE="$APP_DIR/main.jsbundle"
if [ ! -s "$BUNDLE" ]; then
  echo "FATAL: JS bundle missing/empty at $BUNDLE — this build would crash at launch." >&2
  exit 1
fi
echo "OK: JS bundle embedded ($(du -h "$BUNDLE" | cut -f1))"
