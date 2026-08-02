# Xcode Cloud CI

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when configuring or debugging Xcode Cloud builds.

This template ships `ios/ci_scripts/ci_post_clone.sh` — an Xcode Cloud lifecycle hook that fully prepares the Expo managed-workflow project before every cloud build.

### What the hook does
1. Navigates to the repo root via `$CI_PRIMARY_REPOSITORY_PATH`
2. Installs Node.js (Homebrew is available on all Xcode Cloud runners)
3. Runs `npm ci --legacy-peer-deps` (required for the jest-expo peer conflict)
4. Runs `npx expo prebuild --platform ios --clean` to regenerate the native `ios/` tree (`ios/` is gitignored — only `ios/ci_scripts/` is committed via a `.gitignore` exception)
5. Patches the generated Podfile with `inhibit_all_warnings!` to keep the build log readable
6. Runs `pod install`

### Enabling Xcode Cloud
1. Open Xcode → Product → Xcode Cloud → Create Workflow (or use App Store Connect).
2. Set the primary repository to this repo.
3. Xcode Cloud discovers `ios/ci_scripts/ci_post_clone.sh` automatically — no extra configuration needed.

### EAS Build vs Xcode Cloud
- **EAS Build** (default): `eas build --platform ios`. No Xcode Cloud setup needed.
- **Xcode Cloud**: use when you need native Xcode instruments, direct TestFlight integration, or App Store Connect automation. The hook handles `expo prebuild` for you.
