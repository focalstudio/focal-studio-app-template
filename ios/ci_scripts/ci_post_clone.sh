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