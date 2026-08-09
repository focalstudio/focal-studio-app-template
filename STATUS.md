# [APP_NAME] — Status

_Updated: 2026-08-09_

**Version:** 0.13.0 (on `main`, tagged `v0.13.0`)   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app.
**0.13.0 is released and on `main`**, and #126–#131 closed with it as expected, clearing the
carry-forward the last two sessions were tracking. Nothing product-facing moved this session.
The one piece of work is **PR #142, open against `dev` with checks running**: a `Stop` hook
(`.claude/hooks/wrap-reminder.sh`) that blocks a session from ending while the branch has commits
not yet reflected in `STATUS.md`/`ROADMAP.md`. It is a backport, not an invention — MealCart has
had it since `d3b370d`, one commit after being initialised from this template, and it never came
back upstream, so `/wrap` has been enforced there and merely advisory here for the entire time
since. Both paths are tested: silent against a wrapped `dev`, `{"decision":"block"}` against an
unwrapped branch. **The interesting finding is the drift itself** — improvements written inside a
generated app have no path home, and template improvements have no path forward to apps already
bootstrapped. #56 covers exactly one file (privacy) and is still unstarted.

## Next
- **Merge #142**, then decide whether the hook gets backported sideways to already-bootstrapped
  apps. `Vestia-portfolio_manager` is the known candidate; MealCart already has it.
- **First generated app through both stores end to end** — the last unchecked box in Phase 3, and
  the only way to exercise the parts of the pipeline the template itself can never reach. It is
  also the only way to exercise the RevenueCat adapter and the E2E CI job for real.
- **#140** — Supabase free-tier keep-alive. A generated app's project auto-pauses after 7 days
  idle and nothing in the backend adapter prevents it; MealCart hit this live.

## Blockers
None.

Four things worth carrying forward, none of them blocking:

- **Template↔app changes propagate in neither direction.** #142 is the second instance of the same
  shape after the privacy-file problem #56 was filed for: a fix lands in one repo and silently
  fails to reach the others. There is no mechanism, only noticing. Worth a general answer rather
  than a third one-off backport.
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
