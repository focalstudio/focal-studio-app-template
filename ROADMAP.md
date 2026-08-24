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
- [x] Supabase free-tier keep-alive — a generated app's project auto-pauses after 7 days idle,
      and nothing in the backend adapter prevents it (#140)
- [x] Backend docs cover free-tier idle/dormancy behaviour (#141)
- [x] One-command Supabase provisioning via the Management API — `scripts/provision-supabase.sh`
      collapses the manual dashboard steps `add-backend.sh` used to print (#149)

  > No Firebase equivalent is planned, deliberately: non-interactive auth needs a GCP service
  > account that itself needs a pre-existing project, and `projects:create` is gated by
  > per-account quota and billing. Written up in `docs/backends/firebase.md` rather than left
  > as a permanently-open box.

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
- [x] Maestro flows addressed by `testID`, guarded by a static contract test (#126, #128)
- [x] Weekly Maestro run on `dev`, plus simulator-crash attribution (#128, #131)
- [ ] E2E job exercised against a real simulator **in CI** — only reachable from a generated app,
      since every run on the template itself skips at the `[APP_SLUG]` gate
- [ ] Harden `template-smoke-test.yml`'s placeholder assertion — **partly done in #157**.
      The escaped-mention problem is solved: the check now filters on the bracket-escape
      itself (`\[APP_`), which is what makes a mention safe, so six bootstrap gates stop
      needing to be named. It also covers `*.yml`/`*.yaml`, whose absence had been hiding
      two live defects. Still open: it greps the bare prefix rather than `\[APP_[A-Z_]+\]`
      as `init.sh` does, and still carries a five-file exclusion list; its `paths:` filter
      still omits the scripts the check reads, which is how `drift-report.sh` broke it
      silently — found while shipping #155
- [x] Maestro flow reliability — the Danger Zone scroll was a no-op and post-gesture assertions
      flaked ~1-in-3; found in a generated app, invisible from here (#143)
- [ ] Comments that say "this repo" invert when `init.sh` copies them downstream —
      `maestro-e2e.yml` tells a generated app its E2E job skips at the bootstrap gate, which is
      backwards. Unlike the placeholder bug they survive bootstrap intact, and `identical` mode
      leaves no downstream escape hatch, so the reword has to happen here (#159)

## Phase 3 — Release & Store Automation
- [x] Automated tag + GitHub Release on merge to `main` (`release.yml`)
- [x] Android EAS build + submit chained from the same run (`android-release.yml`)
- [x] Xcode Cloud post-clone hook for the Expo managed project (`ios/ci_scripts/`)
- [x] Privacy-policy generator and `verify-privacy.yml` drift check
- [x] Google Play Data safety compliance — account deletion, analytics opt-out, policy URL
- [x] Device-level Maestro flow from launch through account deletion (#80)
- [ ] First template-generated app shipped through both stores end to end

## Phase 4 — Monetization & Growth
- [x] RevenueCat wired behind a `PaywallProvider` port rather than into the store directly (#112)
- [ ] Dev-only Showcase screen for smoke-testing template changes (#54)
- [ ] Encrypted-at-rest session option via `LargeSecureStore` (#66)
- [x] A general answer to fixes not propagating between the template and generated apps — the
      boundary written down in `.github/shared-paths.json`, `/wrap` covering the outbound half
      and `scripts/drift-report.sh` the inbound one. Found instance five on its first run
      (`tick#14`). PR #151 merged (#145)

  > Acting on the ~50 drifted paths the report found is separate work, not part of this box.
  > **tick is fully triaged** as of 2026-08-24 — the mechanical half in `tick#21`, the advisory
  > half in #158 (upstream) and `tick#22` (downstream), with the per-path verdicts written into
  > tick's entry in `.github/shared-paths.json` so the next run skims rather than re-derives.
  > mealcart, WildFocus and vestia are untouched.

- [x] The drift report reports accurately — its normalisation masked placeholders on the
      template side only, so every shared file containing one read as drifted permanently —
      5 of tick's 10 content-drift hits, clearable by no action on either repo. It now
      renders the app's real identity into the template side and compares, which cleared the
      noise and surfaced four defects the masking had been hiding. PR #157 merged (#152)
- [x] `init.sh` substitutes placeholders in YAML — PR #157 merged. Its `EXTS` filter never
      covered `*.yml`, so every generated app shipped a 404 security-advisory link and a
      feature-request form addressed to `\[APP_NAME\]`; the CI assertion shared the blind spot
- [x] `provision-supabase.sh`'s un-bootstrapped sentinel tested by shape — PR #157 merged. As
      a literal it was rewritten by `init.sh`, inverting the guard so every newly generated
      app silently configured no OAuth redirect URLs at all
- [ ] tick at zero content drift and zero missing shared paths — **`tick#21` open, not
      merged**. Against that branch `drift-report.sh` reports only the advisory set, which is
      compared by commit subject and expected to differ. Includes two live tick defects: a
      404 security-advisory link and a placeholder-addressed feature-request form (#145)
- [ ] Act on the drift the report finds for **MealCart, WildFocus and vestia**. tick is
      handled; the other three have not been read since #151. Also re-triage MealCart's
      `skip` array — its 21 entries are a first-pass "known absent", not a verified reading
- [ ] Cross-repo privacy auto-PR workflow (#56) — `publish-privacy.yml` opens a reviewed PR on
      the Pages repo, and the shared token decision was taken with it: one org-owned GitHub App,
      two org secrets, `.claude/reference/cross-repo-token.md`. Merged as PR #154; the App itself
      still needs provisioning — a browser-only flow, and the one step a session cannot do for
      itself
- [ ] Scheduled cross-repo drift report — unblocked by the App above rather than blocked; needs
      the workflow plus token auth in `drift-report.sh`'s `sync_clone`, which clones anonymously
      today. Local script covers it meanwhile (#145)
- [ ] Resolve `react-native-reanimated`'s 25–30% memory regression on SDK 56 (#67)
