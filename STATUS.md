# [APP_NAME] — Status

_Updated: 2026-09-20_

> Narrative only. Version, release age, CI, unreleased commits, roadmap percentage and
> template currency are **derived** — they live on the dashboard
> (`~/.focalstudio/fleet.html`, refreshed every 3 hours) and in `/standup`, both computed
> from git and the GitHub API. Restating them here meant maintaining by hand a number a
> script already knew, which is how this file went stale at 0.14.0 while `main` was on
> 0.15.0. Keep this file to what no script can derive: what is going on, what is next,
> and what is in the way.

## Now
The propagation machinery is being made **version-aware and framework-aware**. PR #168 (open)
adds `TEMPLATE_VERSION` — which template release an app is on, tracked by release tag rather than
`dev` — replacing a commit-subject grep that degraded silently on squashed or transferred history.
The same PR extends the contract into the template's own seams (`src/env.ts`, `env.js`,
`storage.ts`, `useTheme.ts`, the spacing scale, both service ports), which had been invisible to
drift while the paywall *adapter* was tracked and the *port* it plugs into was not.

Upstream of it, #166 shipped `cross-repo-report.yml` — the weekly scheduled drift + fleet report —
and gave `sync_clone` token auth. Both were listed as open work; both are done.

A session-long plan for the wider goal (one dashboard, apps that adopt template releases
themselves, a site that stays current) is at `~/.claude/plans/i-want-to-make-dreamy-zebra.md`.

## Next
- **Provision the GitHub App.** Unchanged, and now blocking more: `cross-repo-report.yml` exists
  and skips cleanly every week because the secrets are absent, so the scheduled reports are built
  and inert. Browser-only flow plus `gh auth refresh -h github.com -s admin:org`; steps in
  `.claude/reference/cross-repo-token.md`.
- **Fleet dashboard (plan PR 2).** `fleet-report.sh --html` writing a self-contained page to
  `~/.focalstudio/`, refreshed by a launchd agent so it is current without a command being typed.
  `--json` is already the seam.
- **MealCart is missing `clearByPrefix` from `storage.ts`** — the account-deletion purge helper —
  found by #168's first run. It sits on the path the Play Data Safety work depends on. Decide
  whether to open an issue downstream.

## Blockers
None blocking work; the GitHub App gates three scheduled/cross-repo consumers from doing anything.

**Carrying forward** (live context, not blocking):
- **`provision-supabase.sh` has never run against a live Supabase account**, and CI can only ever
  reach `--dry-run`. Any app bootstrapped after it landed has the inverted redirect-URL guard.
- **The E2E job has never run against a real simulator in CI on this repo** — every run skips at
  the `[APP_SLUG]` gate, by construction. Locally it still needs Metro on **port 8081
  specifically**.
- **The RevenueCat adapter has never run against a live RevenueCat project.** CI proves the
  wiring, not the purchase.
- **Propagation has a mechanism but the fleet is not homogeneous** — tick is triaged; MealCart,
  WildFocus and vestia have not been read since #151.
