# [APP_NAME] — Status

_Updated: 2026-08-11_

**Version:** 0.14.0 (on `main`, tagged `v0.14.0`)   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app.

**#56 answered — PR #154 open, CI green, awaiting merge to `dev`.** The cross-repo token
decision is taken, once, for both consumers that were stalled on it: **one org-owned GitHub App**
(`Focal Studio Cross-Repo Bot`), two org secrets, each workflow minting a token narrowed to the
repos it touches.

**The reason it isn't a PAT is the opposite of the intuition.** A fine-grained PAT looks like the
smaller thing — one secret instead of two — but it applies **one permission union across every
repo it selects**, so a single PAT serving both consumers hands `tick`/`mealcart`/`WildFocus`/
`vestia` the `pull_requests:write` they never need. Two PATs is precisely the
two-secrets-two-rotations outcome the decision existed to avoid. The App is also org-owned rather
than bound to one account, has no annual expiry, and shows in the audit log as a named bot.
Written up in `.claude/reference/cross-repo-token.md` so the next cross-repo workflow doesn't
re-derive it.

`publish-privacy.yml` is the first consumer: dispatch-only with a `dry_run` input, it regenerates
`privacy-<slug>.html`, diffs it against the live page, and **opens a PR — never commits, never
merges**. Re-running force-updates one stable `privacy/<slug>` branch so it refreshes that PR
instead of stacking. This is the same conclusion `drift-report.sh` reached for the same reason,
and it is now a stated rule for any cross-repo workflow.

**#56's clobber Note needed no new mechanism** — the config-presence gate already *is* the opt-in.
MealCart has no `store-listing/privacy.config.json` at all (no `privacy-shell.html`, no
`PRIVACY.md`, and `gen-privacy-policy.mjs`/`verify-privacy.yml` were already in its `skip` array),
so it sits outside the generator entirely and the workflow skips there. Belt and braces on top:
the PR body carries the full diff and leads with a warning when it would remove more lines than
it adds.

The gate itself moved to `scripts/privacy-gate.sh`, shared with `verify-privacy.yml`. Not tidying
— it carries the host allowlist regex that bounds the runner to `focalstudio.github.io`, and two
hand-synced copies of a security check is exactly the drift `shared-paths.json` exists to fight.
**The two must travel together:** an app that receives the new `verify-privacy.yml` without the
script gets a broken workflow.

**#145 merged (#151).** The propagation problem
now has a mechanism instead of a memory. `.github/shared-paths.json` writes down the
template ↔ app boundary; `scripts/drift-report.sh` reports drift against it (read-only, both
directions, no secret — it runs on your own `gh auth`); `/wrap` gained a step 2 covering the
outbound half.

The issue offered three options and picked none, and **its cost ordering does not survive
contact with the repos**: options 1 and 2 both need the shared/diverges boundary written down,
and that boundary *is* option 3's manifest. So the manifest was never the expensive part — the
**apply** half is, and that half is now **rejected rather than deferred**. tick's `.maestro`
flows differ from ours by 59 lines, **58 of them correct** app-specific prose and 1 a real
unpropagated fix; any copy destroys the 58 to deliver the 1, and nothing mechanical separates
them. Recorded in `.claude/CLAUDE.md` so it isn't re-proposed. Extend the report, never the
writer.

**The report found instance five on its first run**, which is the whole claim: `tick#14` had
raised the Maestro cold-start waits from 60s to 180s after measuring a **54,161 ms** first-bundle
serve on a cold `macos-latest` runner, and that never came back upstream. Backported here. The
inverse too — `wrap-reminder.sh`, the entire subject of #142, was *absent from tick*, and vestia
is missing it plus both session commands, which is #142's own untaken follow-up.

The design detail worth keeping: `advisory` paths (`.maestro/*`, `docs/*.md`) are compared by
**commit subject, not content**, bounded on both sides by the app's bootstrap commit. A content
diff cannot tell "this app renamed a screen in a comment" from "this app fixed a real bug"; a
list of commit subjects can, and needs no stored state to do it. `identical` paths are diffed
after `[APP_NAME]`/`[APP_SLUG]`/`[GITHUB_REPO]` normalisation — skip that and all 181 shared
files read as drifted.

Also found while building it: the gitignored clone cache at `.claude/scratch/drift/` is invisible
to CI but **Jest and ESLint both walk into it** — before the exclusions, a drift run left
`npm test` running tick's entire suite and `npm run lint` reporting 523 problems when the real
baseline is 10.

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
- **Provision the GitHub App, then close the loop on #154.** This is the one deliverable a session
  structurally cannot do for itself: creating a GitHub App is a browser-only flow with no API
  path, and setting org secrets needs an `admin:org` scope `gh` doesn't request by default. Steps
  are in `.claude/reference/cross-repo-token.md`. Once the two secrets exist, dispatch
  `verify-privacy.yml` here (expect: still green, still skipping — proves the gate refactor is
  inert) and `publish-privacy.yml` here (expect: token minted, then clean skip — the mint sits
  ahead of the bootstrap gate precisely so this repo can prove the App is installed on the Pages
  repo, which is otherwise the one thing it cannot check about itself).
- **Nothing in the fleet can exercise the privacy PR path yet.** `tick` has no
  `privacy.config.json`, MealCart is outside the generator, so the only live per-app page is
  MealCart's hand-written one. Proving `publish-privacy.yml` end to end means giving tick a real
  config on a branch first — which it needs anyway — and dispatching with `dry_run` before
  `dry_run: false`. Same downstream-only shape as the E2E and Supabase entries below.
- **Run `provision-supabase.sh` against a real Supabase org, from a generated app.** CI can only
  ever reach `--dry-run`, so create → wait → schema → verify has never touched a live account. Note
  it cannot be validated *here*: `env.js` in the template has `BACKEND = "none"` by design and the
  script's own preflight refuses to run, so the first real exercise is downstream — same structural
  gap as the E2E job two bullets down, and worth pairing with the next bootstrap or a MealCart
  project refresh rather than treating as separate work.
- **First generated app through both stores end to end** — the last unchecked box in Phase 3, and
  the only way to exercise the parts of the pipeline the template can never reach itself.
- **Act on the 50 drifted paths the report finds** (#151 merged). The mechanism exists; nothing has
  been *acted on* yet beyond the one backport. The two clearest: `wrap-reminder.sh` is missing
  from tick, WildFocus and vestia (vestia also lacks both session commands), and tick is behind on
  `expo-services/SKILL.md`, `verify-backend.yml` and `schema.sql`. Also re-triage MealCart's
  `skip` array — its 21 entries are my first-pass "known absent", not a verified reading.

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

- **Propagation now has a mechanism, but the fleet is not homogeneous and the report is still
  local-only.** #145 is answered (PR #151), so this is no longer "someone has to remember" — but
  two caveats survive. First, only `tick` and `mealcart` are true descendants: **WildFocus is a
  Capacitor + Vite app**, and vestia predates the current layout, so both are compared on a
  deliberately tiny `limitedScope` slice and a uniform diff across all four would be ~90% noise.
  Second, the **scheduled** version of the report is still not built — but as of #154 it is
  unblocked rather than blocked. The App decision that gated it is taken; what remains is the
  workflow plus token auth in `sync_clone`, which clones anonymously over HTTPS today and works
  locally only because it borrows the operator's own `gh` credential helper.
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
