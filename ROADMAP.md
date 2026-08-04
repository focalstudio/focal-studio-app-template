# [APP_NAME] — Roadmap

> The **template's own** roadmap — what this starter kit has and what it still needs.
> `scripts/init.sh` replaces this file with a fresh starter roadmap when you bootstrap an app,
> so a generated app never inherits these phases.
>
> `/standup` computes progress bars from the `## Phase` headings and their checkboxes;
> `/wrap` checks boxes off as work ships. Headings **must** start with `## Phase`.

## Phase 1 — Template Foundation
- [x] Expo SDK 56 / React Native 0.85 baseline, New Architecture enabled
- [x] Expo Router file-based navigation with `(auth)` / `(tabs)` route groups
- [x] Design-token theme (`src/theme/`) consumed through `useTheme()`
- [x] Zustand stores for app, auth, onboarding and paywall state
- [x] Onboarding, auth, paywall, settings and network-error screens
- [x] Dev mode behind the version-scoped key, plus the `isDevBuild` gate (`src/env.ts`)
- [x] `scripts/init.sh` one-shot bootstrap, smoke-tested in CI (#75)
- [x] Auth port with Supabase and Firebase adapters via `scripts/add-backend.sh` (#76)
- [x] Apple and Google sign-in via `scripts/add-social-auth.sh` (#70)

## Phase 2 — Test & CI Hardening
- [x] React Native screen-test harness (#77)
- [x] Screen render tests for onboarding, auth, paywall and settings (#78)
- [x] Dev-only seed-session seam so the app is E2E-drivable with no backend (#79)
- [x] Wiring a backend leaves the Jest suite green (#100)
- [x] Coverage collection and thresholds gated in CI, with a floor of its own for `src/services/` (#111)
- [x] Service-layer unit tests — analytics, notifications, rating, haptics (#111)
- [x] Auth port validator tests — session/user shape and expiry boundaries (#111)
- [x] Backend adapter contract tests for both Supabase and Firebase (#111)
- [x] Social sign-in module contract tests (#114)
- [x] `scripts/e2e.sh` preflight; `npm run e2e` validated end-to-end against a real simulator (#113)
- [x] Maestro E2E gated pre-merge on PRs to `main`, plus an opt-in `e2e` label (#113)
- [ ] E2E job exercised against a real simulator **in CI** — only reachable from a generated app,
      since every run on the template itself skips at the `[APP_SLUG]` gate

## Phase 3 — Release & Store Automation
- [x] Automated tag + GitHub Release on merge to `main` (`release.yml`)
- [x] Android EAS build + submit chained from the same run (`android-release.yml`)
- [x] Xcode Cloud post-clone hook for the Expo managed project (`ios/ci_scripts/`)
- [x] Privacy-policy generator and `verify-privacy.yml` drift check
- [x] Google Play Data safety compliance — account deletion, analytics opt-out, policy URL
- [x] Device-level Maestro flow from launch through account deletion (#80)
- [ ] First template-generated app shipped through both stores end to end

## Phase 4 — Monetization & Growth
- [ ] RevenueCat wired behind a `PaywallProvider` port rather than into the store directly (#112)
- [ ] Dev-only Showcase screen for smoke-testing template changes (#54)
- [ ] Encrypted-at-rest session option via `LargeSecureStore` (#66)
- [ ] Cross-repo privacy auto-PR workflow (#56)
- [ ] Resolve `react-native-reanimated`'s 25–30% memory regression on SDK 56 (#67)
