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
- [ ] tick store-readiness audit — the drift sessions were its prerequisite, so a release would
      not discover tick's `.maestro` and `docs/testing.md` were behind on E2E fixes. They no
      longer are. Gate on the whole store push
- [ ] Prove `publish-privacy.yml` end to end — nothing in the fleet can exercise it yet: `tick`
      has no `privacy.config.json` and MealCart is outside the generator. Needs tick given a real
      config on a branch first, which it wants anyway (#56)
- [ ] Run `provision-supabase.sh` against a real Supabase org from a generated app — more urgent
      since the redirect-URL guard was inverted for every app that ran it after bootstrap. CI can
      only ever reach `--dry-run`
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
- [x] tick at zero content drift — `tick#21` and `tick#22` both merged 2026-08-24. A drift run
      on 2026-09-20 reports **0 content drift**; what remains is the advisory set, compared by
      commit subject and expected to differ. The two live tick defects it carried (a 404
      security-advisory link, a placeholder-addressed feature-request form) went with it (#145)
- [ ] Act on the drift the report finds for **MealCart, WildFocus and vestia**. tick is
      handled; the other three have not been read since #151. Also re-triage MealCart's
      `skip` array — its 21 entries are a first-pass "known absent", not a verified reading
- [ ] Cross-repo privacy auto-PR workflow (#56) — `publish-privacy.yml` opens a reviewed PR on
      the Pages repo, and the shared token decision was taken with it: one org-owned GitHub App,
      two org secrets, `.claude/reference/cross-repo-token.md`. Merged as PR #154; the App itself
      still needs provisioning — a browser-only flow, and the one step a session cannot do for
      itself
- [x] Fleet inventory — `scripts/fleet-report.sh` / `/fleet` answers "what database does each app
      use, what shipped last, what needs attention" across the org in one screen. Hand-maintains
      nothing: the repo list comes from `gh repo list`, so a new app appears the moment it exists.
      Database verdicts print their evidence, and are inferred from `package.json` where `env.js`
      is absent — which is three of the four apps, and the only reason a Capacitor app and a
      pre-template Expo app are legible alongside the rest. PR #162 merged
- [ ] Scheduled cross-repo drift report — unblocked by the App above rather than blocked; needs
      the workflow plus token auth in `drift-report.sh`'s `sync_clone`, which clones anonymously
      today. Local script covers it meanwhile (#145)
- [ ] Scheduled fleet report (#163) — shares the drift report's blocker exactly: the same GitHub
      App, `contents: read` only. `fleet-report.sh --json` is the seam. A Pages variant must
      filter to public repos only; four of the six are private
- [ ] Resolve `react-native-reanimated`'s 25–30% memory regression on SDK 56 (#67)
