#!/bin/sh
set -e

# Xcode Cloud runs this script from ios/ci_scripts/ — move to repo root first
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install Node.js — Xcode Cloud runners have Homebrew available
brew install node

# Install JS dependencies (--legacy-peer-deps required: jest-expo peer conflict)
npm ci --legacy-peer-deps

# Regenerate the native iOS project from app.json / Expo config.
# ios/ is gitignored; this hook recreates it before Xcode Cloud tries to build.
npx expo prebuild --platform ios --clean

# Pin node's absolute path for the Xcode "Bundle React Native code and images" phase.
# That phase sources ios/.xcode.env, whose default `NODE_BINARY=$(command -v node)` is
# re-evaluated inside a PATH-limited build-phase shell that does NOT include Homebrew's
# bin dir — so `command -v node` finds nothing, the bundle script exits early, and the
# archive ships WITHOUT main.jsbundle (crashes at launch, silently, "Build Succeeded").
# .xcode.env.local overrides .xcode.env and is read at build-phase time; write the
# already-resolved path ourselves instead of relying on re-resolution. prebuild --clean
# above wiped any prior .xcode.env.local, so this is a fresh, correct pin every run.
NODE_BINARY_PATH="$(command -v node)"
if [ -z "$NODE_BINARY_PATH" ]; then
  echo "FATAL: node not found after 'brew install node'." >&2
  exit 1
fi
echo "export NODE_BINARY=$NODE_BINARY_PATH" > ios/.xcode.env.local
echo "Pinned NODE_BINARY=$NODE_BINARY_PATH in ios/.xcode.env.local"

# Suppress CocoaPods pod warnings globally.
# prebuild regenerates the Podfile fresh each run, so inhibit_all_warnings! must
# be injected here rather than committed to the Podfile.
python3 -c "
content = open('ios/Podfile').read()
if 'inhibit_all_warnings!' not in content:
    open('ios/Podfile', 'w').write('inhibit_all_warnings!\n\n' + content)
    print('Podfile patched: inhibit_all_warnings! added')
else:
    print('Podfile already has inhibit_all_warnings!')
"

# Install CocoaPods dependencies explicitly (prebuild does not always run pod install)
cd ios && pod install

# Verify the Release Hermes artifact actually landed. `pod install` fetches both the
# debug and release Hermes tarballs into Pods/hermes-engine-artifacts/. The RN
# "[Hermes] Replace Hermes for the right configuration" build phase EXTRACTS the
# already-local release tarball for a device archive — it does not download it. A
# flaky/partial pod install can silently omit it, and the failure only surfaces ~6 min
# later in the Archive action (empty hermesvm.xcframework/ios-arm64 → Copy-XCFrameworks
# rsync fails). Fail loudly here, and self-heal from Maven if it's missing.
HERMES_VER="$(grep -m1 -oE 'hermes-engine \([0-9.]+\)' Podfile.lock | grep -oE '[0-9.]+')"
ART_DIR="Pods/hermes-engine-artifacts"
REL="$ART_DIR/hermes-ios-${HERMES_VER}-release.tar.gz"
if [ ! -s "$REL" ]; then
  echo "Release Hermes artifact missing after pod install — fetching from Maven"
  mkdir -p "$ART_DIR"
  curl -fL --retry 3 -o "$REL" \
    "https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/${HERMES_VER}/hermes-ios-${HERMES_VER}-hermes-ios-release.tar.gz"
fi
[ -s "$REL" ] || { echo "FATAL: Release Hermes artifact still missing at ios/$REL" >&2; exit 1; }
echo "OK: Release Hermes artifact present ($REL)"