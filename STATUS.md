# [APP_NAME] — Status

_Updated: 2026-08-05_

**Version:** 0.12.0   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app.
**0.12.0 is the monetization release**, carrying the two halves of #112 from `dev` to `main`:
#120 put the paywall behind a `PaywallProvider` port (the same port/adapter shape as
`src/services/auth/`), and #121 added `scripts/add-paywall.sh` plus the RevenueCat adapter behind
it. Nothing is installed by default — an app that never monetizes still carries no in-app purchase
dependency, no native rebuild and no store key at boot. `app/paywall.tsx` now renders
store-localized prices: the hardcoded `$4.99`/`$29.99`/`$79.99` were wrong in every non-USD
storefront and wrong the day a price changed in App Store Connect, an App Store Guideline 3.1.2
exposure the template shipped by default. One breaking change —
`usePaywallStore.setSubscription()` is gone; it granted Pro with no payment and persisted it, the
entitlement twin of the fake-signup scaffold already deleted from auth. Use `purchase(tier)`, or
`seedLocalSubscription()` for tests and dev builds.

## Next
- **First generated app through both stores end to end** — the last unchecked box in Phase 3, and
  the only way to exercise the parts of the pipeline the template itself can never reach. It is
  also the only way to exercise the RevenueCat adapter and the E2E CI job for real.
- **#54** — dev-only Showcase screen for smoke-testing template changes.
- **#66** — encrypted-at-rest session option via `LargeSecureStore`.

## Blockers
None.

Three things worth carrying forward, none of them blocking:

- **#112 stays open until 0.12.0 lands on `main`.** `Closes` only fires on merges to the default
  branch and template PRs target `dev`, so the work shipped while the issue stayed open — the same
  mechanic that held #113 and #114 open through 0.11.0. The release PR closes it.
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
