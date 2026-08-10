# [APP_NAME] — Status

_Updated: 2026-08-10_

**Version:** 0.13.0 (on `main`, tagged `v0.13.0`)   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app.
#144 merged, closing #143 — the Danger Zone scroll is real and the Maestro flows no longer flake.
The open work is **PR #146, green and waiting to merge** (#140 + #141): a free Supabase project is
auto-paused after 7 days without *database* activity, so `schema.sql` gains a `keepalive_ping()`
RPC and `supabase-keepalive.yml` calls it daily. **The design detail is the point** — the workflow
asserts the *shape* of the response, not the HTTP status, because the version written downstream
first pinged `/auth/v1/health`, which is served by GoTrue and never opens a database connection,
and was green for 10 consecutive runs while Supabase was still flagging the project for pause.
`verify-backend.yml` now asserts the inverse of its `delete_own_account` check — anon *can* execute
the ping and gets a timestamp — because that grant is what the whole thing rests on and losing it
would surface only as a paused project weeks later. Both backend docs pages now cover idle
behaviour, which is a real selection input that was invisible at the moment you choose.

Also this session, and the more interesting half: **the guard fix went upstream into `tick`**
(`tick#17`, PR #18, merged). Its `"swipes once per onboarding slide"` check was passing while
examining nothing — its own #13 added an `extendedWaitUntil` on `onboarding-cta` before the first
swipe, and the guard cut the flow at the first *appearance* of that id, counted zero swipes, and
treated zero as "not comparable". Proved in both directions with a deliberately-broken three-swipe
flow: green under the old form, correctly red under the new one. A vacuous check and a working
check are both green, so nothing in tick could ever have raised its hand.

## Next
- **Merge #146** — checks are green, including `Supabase contract & typed database`, which applied
  `schema.sql` twice to a real Postgres and confirmed the hand-edited `database.types.ts` matches
  what the CLI generates.
- **First generated app through both stores end to end** — the last unchecked box in Phase 3, and
  the only way to exercise the parts of the pipeline the template can never reach itself.
- **#145** — pick an option for the propagation problem, or consciously decide not to. The issue
  lays out three (a `/wrap` backport prompt, a scheduled drift report, a sync script over an
  explicit manifest) and deliberately picks none.

## Blockers
None.

Four things worth carrying forward, none of them blocking:

- **Fixes still propagate between the template and generated apps only by someone remembering** —
  now written up as **#145** rather than re-derived each time. Four instances: #56 (privacy, still
  unstarted), #142 (from MealCart), #143 (from tick), and `tick#17` (this session, template → app).
  Three of the four travelled *app → template*, the direction with no mechanism at all. `tick#17`
  is the sharpest version: the symptom there was a test that passed while checking nothing, so
  there was no failing build, no error, and no drift warning to notice.
- **The E2E job has still never run against a real simulator in CI *on this repo*** — every run
  skips at the `[APP_SLUG]` gate, including the weekly `dev` cron. This is structural, not a gap to
  close: a template has no app to drive, so runtime defects in `.maestro/*.yaml` are discovered
  downstream **by construction**. Same shape as #140 itself, which MealCart found live. Do not add
  the `e2e` label to a template PR expecting a signal.
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
