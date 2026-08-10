# [APP_NAME] — Status

_Updated: 2026-08-10_

**Version:** 0.14.0 (on `main`, tagged `v0.14.0`)   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app.
**#149 merged to `dev`**: `scripts/provision-supabase.sh` turns every manual
dashboard step `add-backend.sh supabase` used to print into one command, through the Supabase
Management API — create project, wait, read the publishable key, write `.env.local`, apply
`schema.sql`, set redirect URLs / email confirmation / the Google + Apple providers, optionally set
the two repo secrets `supabase-keepalive.yml` needs. It **verifies rather than assumes**, and the
three post-conditions are chosen because they are the ones that fail *silently*: RLS actually on
(policies without RLS leave the table world-readable and the dashboard never warns you),
`delete_own_account()` present (its absence turns the Play Data-safety claim into a no-op), and
`anon` able to execute `keepalive_ping()` (its absence pauses the project weeks later). Read-only
checks rather than a call into `verify-backend-contract.mjs` — that one is far more thorough but
needs the `service_role` key and creates and deletes real users, which is right for a throwaway
local instance and wrong against a project bound for production.

The credential shape is the other half of the design. `SUPABASE_ACCESS_TOKEN` is read from the
environment for one run: never written to disk, never in argv (`ps` is world-readable), never
echoed. It is account-wide and can delete every project you own — the exact opposite of the
publishable key it writes into `.env.local`, which is built to ship inside a client binary. Request
bodies stage through a `mktemp` dir for the same reason, since `--google-client-secret` would
otherwise be visible in `ps`.

**Firebase deliberately got a documented "no" instead of a script** — non-interactive auth needs a
GCP service account that itself needs a pre-existing project, and `projects:create` is gated by
per-account quota and billing. A script that works for its author and fails on someone else's
Google account is worse than the honest checklist already in `docs/backends/firebase.md`. Neither
provider's *account signup* is automatable at all: ToS plus captcha, no API. That is the one
irreducible manual step, alongside the Google Cloud consent screen and the Apple Developer
capability — both of which the script prints exact instructions for.

Copilot's review caught the one thing worth remembering: `--dry-run` printed request bodies
verbatim, so `--google-client-secret` was echoed to stdout — and the smoke-test step tees a dry run
into a CI log, which would have published it. Body dumps now go through a jq filter matching
credential-shaped **key names**, so a field added later is redacted by default rather than leaking
until someone notices. The regression guard passes `NEVER_PRINT_ME` and asserts both that it is
absent *and* that the redaction marker is present — checked in both directions, red with the filter
replaced by identity.

**Shipped in 0.14.0** (#140 + #141): a free Supabase project is auto-paused after 7 days without
*database* activity, so `schema.sql` gains a `keepalive_ping()` RPC and `supabase-keepalive.yml`
calls it daily. **The design detail is the point** — the workflow asserts the *shape* of the
response, not the HTTP status, because the version written downstream first pinged
`/auth/v1/health`, which is served by GoTrue and never opens a database connection, and was green
for 10 consecutive runs while Supabase was still flagging the project for pause.
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
- **Run `provision-supabase.sh` against a real Supabase org, from a generated app.** CI can only
  ever reach `--dry-run`, so create → wait → schema → verify has never touched a live account. Note
  it cannot be validated *here*: `env.js` in the template has `BACKEND = "none"` by design and the
  script's own preflight refuses to run, so the first real exercise is downstream — same structural
  gap as the E2E job two bullets down, and worth pairing with the next bootstrap or a MealCart
  project refresh rather than treating as separate work.
- **First generated app through both stores end to end** — the last unchecked box in Phase 3, and
  the only way to exercise the parts of the pipeline the template can never reach itself.
- **#145** — pick an option for the propagation problem, or consciously decide not to. The issue
  lays out three (a `/wrap` backport prompt, a scheduled drift report, a sync script over an
  explicit manifest) and deliberately picks none.

## Blockers
None.

- **`provision-supabase.sh` has never run against a live Supabase account**, and structurally
  cannot be run from this repo — `env.js` here is `BACKEND = "none"` by design, and the script's
  preflight refuses on exactly that. Same shape as the RevenueCat and E2E entries below: CI proves
  the plumbing (`--dry-run` covers argument parsing, both preflight gates, and every request body),
  and the rest is discovered downstream by construction. What a dry run cannot reach is everything
  involving Supabase's actual responses — the `ACTIVE_HEALTHY` poll, the publishable-vs-legacy key
  selection, and whether the three post-schema assertions read `true` off a real Postgres.

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
