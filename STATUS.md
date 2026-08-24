# [APP_NAME] — Status

_Updated: 2026-08-24_

**Version:** 0.14.0 (on `main`, tagged `v0.14.0`)   **Stage:** Template / pre-app

## Now
Template repo at 0.14.0 with **#154 and #155 both merged to `dev`** and nothing blocked. #145 is
done and merged (#151); the propagation problem now has a mechanism instead of a memory, and
acting on what the report found is the work that remains. The repo description — which still read
`Capacitor + React + TypeScript app scaffold`, a leftover describing WildFocus rather than this
repo — was corrected at the same time.

**#155 (merged) — `LICENSE` now matches the visibility of the repo it sits in.** The template shipped one
license calling the source "proprietary and **confidential**" while this repo is public. Nothing
leaked (no credential file on any ref, no `pull_request_target`, no self-hosted runners, no
secret-consuming workflow on a `pull_request` trigger) — but the file asserted something false
about its own repo, and resolving that the *other* way would silently break the two things public
visibility buys: free GitHub-hosted runners, and `drift-report.sh`'s anonymous clone from inside a
generated app. Two variants under `templates/licenses/`, identical in legal posture;
`scripts/init.sh` installs the matching one instead of letting the template's copy be inherited,
with **one `VISIBILITY` variable driving both the license and `gh repo create`** — private by
default, `--public` flips both. Coupling them is the point: two independent settings disagreeing is
the exact bug being repaired.

That PR also surfaced a **pre-existing CI failure it did not cause**: `drift-report.sh` contains
literal `[APP_*]` text by design, and `template-smoke-test.yml`'s assertion flagged it. It landed
in #151, which never ran the check — the workflow's `paths:` filter doesn't include
`drift-report.sh`, so the first PR to touch a triggering path inherited the failure. One-line
exclusion added; the deeper fix (that check still uses the over-broad regex `init.sh` itself
abandoned) is now a Phase 2 box.

**#154 (merged) — the cross-repo privacy publish, and the token decision behind it (#56).**
`publish-privacy.yml` regenerates `privacy-<slug>.html`, diffs it against the live page on
`focalstudio.github.io`, and **opens a PR — never commits, never merges**. Re-running
force-updates one stable `privacy/<slug>` branch so it refreshes that PR instead of stacking. A
live page can be hand-written and richer than the generated one (MealCart's is), and nothing
mechanical separates "stale" from "deliberately better" — the same conclusion `drift-report.sh`
reached for the same reason, now a stated rule for any cross-repo workflow.

**The token is one org-owned GitHub App, and the reason it isn't a PAT is the opposite of the
intuition.** A fine-grained PAT looks like the smaller thing — one secret instead of two — but it
applies **one permission union across every repo it selects**, so a single PAT serving both
consumers would hand `tick`/`mealcart`/`WildFocus`/`vestia` a `pull_requests:write` they never
need; two PATs is precisely the two-secrets-two-rotations outcome the decision existed to avoid.
The App is org-owned rather than bound to one account, has no annual expiry, and shows in the
audit log as a named bot. Written up in `.claude/reference/cross-repo-token.md` so the next
cross-repo workflow doesn't re-derive it — the scheduled drift report is the second consumer, and
this is one decision taken once for both.

#56's clobber concern needed no new mechanism: the config-presence gate already *is* the opt-in,
and MealCart has no `store-listing/privacy.config.json` at all, so it sits outside the generator
entirely. The gate itself moved to `scripts/privacy-gate.sh`, shared with `verify-privacy.yml` —
not tidying, since it carries the host allowlist regex bounding the runner to
`focalstudio.github.io`, and two hand-synced copies of a security check is exactly the drift
`shared-paths.json` exists to fight. **The two must travel together:** an app receiving the new
`verify-privacy.yml` without the script gets a broken workflow.

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
  `dry_run: false`.
- **Decide whether `templates/licenses/*` travels to tick.** Those two files are
  inert downstream — a generated app never re-runs `init.sh`, and `init.sh` is deliberately
  excluded from `scripts/*` so tick never gets the installer anyway. But `templates/*` is
  `identical` mode, so tick will show permanent drift until they are either copied or excluded.
  Pick one; don't leave the report noisy.
- **Act on the ~50 drifted paths #151 found.** Nothing has been acted on beyond the one backport.
  Clearest two: `wrap-reminder.sh` is missing from tick, WildFocus and vestia (vestia also lacks
  both session commands), and tick is behind on `expo-services/SKILL.md`, `verify-backend.yml` and
  `schema.sql`. Also re-triage MealCart's `skip` array — its 21 entries are a first-pass "known
  absent", not a verified reading.
- **Run `provision-supabase.sh` against a real Supabase org, from a generated app.** CI can only
  ever reach `--dry-run`, so create → wait → schema → verify has never touched a live account, and
  it cannot be validated here: `env.js` is `BACKEND = "none"` by design and the script's preflight
  refuses. Pair it with the next bootstrap or a MealCart refresh.
- **First generated app through both stores end to end** — the last unchecked box in Phase 3, and
  the only way to exercise the parts of the pipeline the template can never reach itself.

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
  local-only.** #145 is answered and merged (#151), so this is no longer "someone has to remember" — but
  two caveats survive. First, only `tick` and `mealcart` are true descendants: **WildFocus is a
  Capacitor + Vite app**, and vestia predates the current layout, so both are compared on a
  deliberately tiny `limitedScope` slice and a uniform diff across all four would be ~90% noise.
  Second, the **scheduled** version of the report is not built. That is no longer blocked on a
  decision — #56's org-owned GitHub App covers both consumers and is written up in
  `.claude/reference/cross-repo-token.md`. What remains is the workflow itself plus token auth in
  `drift-report.sh`'s `sync_clone`, which still clones anonymously over HTTPS and so cannot read a
  private sibling at all. The local script covers the need until the fleet grows.
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
