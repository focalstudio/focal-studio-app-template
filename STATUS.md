# [APP_NAME] — Status

_Updated: 2026-08-08_

**Version:** 0.13.0   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app.
**0.13.0 is the test-and-CI hardening release**, carrying #126–#131 from `dev` to `main`. Its
theme is the gap between "the template's own checks are green" and "a *generated* app's checks
are green". Both Maestro flows addressed elements by placeholder copy — onboarding slide titles,
the home card's `"Welcome"`, the settings page title — so they shipped green here and failed the
first time anyone wrote their own product (#126); every selector is now a `testID`, and
`src/__tests__/e2e-contract.test.ts` fails statically, in under a second on every branch, if one
goes missing. The same blind spot had already let a dead `"Start Free Trial"` assertion survive a
release. `init.sh` created 4 of 18 issue labels, so a generated app could not follow the labelling
convention it ships with and could never apply the `e2e` opt-in gate (#127) — the set now lives in
`.github/labels.tsv` behind `scripts/sync-labels.sh`, and an older generated app can self-heal by
running it. A weekly Maestro run on `dev` covers the rot a static check cannot see (#128), and
`scripts/check-simulator-crashes.sh` now names the simulator's own SpringBoard segfaults instead of
letting them read as app navigation bugs (#131). One user-facing change: Settings' three-Toggle
appearance picker is a single **Dark Mode** switch (#129) — `"device"` stays the persisted default
and the `hydrate` fallback, it just stops being selectable.

## Next
- **First generated app through both stores end to end** — the last unchecked box in Phase 3, and
  the only way to exercise the parts of the pipeline the template itself can never reach. It is
  also the only way to exercise the RevenueCat adapter and the E2E CI job for real.
- **#54** — dev-only Showcase screen for smoke-testing template changes.
- **#66** — encrypted-at-rest session option via `LargeSecureStore`.

## Blockers
None.

Four things worth carrying forward, none of them blocking:

- **#126–#131 stay open until 0.13.0 lands on `main`.** `Closes` only fires on merges to the
  default branch and template PRs target `dev`, so the work shipped while the issues stayed open —
  the same mechanic that held #113/#114 open through 0.11.0 and #112 through 0.12.0. The release PR
  closes all six.
- **The E2E job has still never run against a real simulator in CI.** Every run on this repo skips
  at the `[APP_SLUG]` bootstrap gate, including the new weekly `dev` cron, so what 0.13.0 added is
  static coverage of the flows plus a scheduled slot that only starts doing work in a generated
  app. The gap is the open Phase 2 box, and it closes from the app side, not from here.
- **The RevenueCat adapter has never run against a live RevenueCat project.** CI proves the wiring
  (`Wire RevenueCat Paywall` and `Wire Supabase Backend + RevenueCat Paywall` both green, the
  latter being the only check that catches one `add-*.sh` clobbering the other's selector), and the
  contract test pins `errors.ts` against the SDK's real `PURCHASES_ERROR_CODE` enum. The two traps
  that look like bugs in this code — all subscriptions in one App Store Connect group, and the
  In-App Purchase Key + Server Notifications URL, without which renewals never reach RevenueCat and
  the entitlement listener goes silent forever — are documented in `docs/paywall/revenuecat.md` and
  only reachable from a real app.
- Running the E2E flows locally still needs Metro on **port 8081 specifically** — `RCT_METRO_PORT`
  is baked nowhere in the Expo prebuild, so `--port` moves only the CLI's server, not what the
  installed debug build probes. See the E2E section of `docs/testing.md` for the `RCT_jsLocation`
  workaround when 8081 is occupied.
