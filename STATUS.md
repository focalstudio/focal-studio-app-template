# [APP_NAME] — Status

_Updated: 2026-09-22_

> Narrative only. Version, release age, CI, unreleased commits, roadmap percentage and
> template currency are **derived** — they live on the dashboard
> (`~/.focalstudio/fleet.html`, refreshed every 3 hours) and in `/standup`, both computed
> from git and the GitHub API. Restating them here meant maintaining by hand a number a
> script already knew, which is how this file went stale at 0.14.0 while `main` was on
> 0.15.0. Keep this file to what no script can derive: what is going on, what is next,
> and what is in the way.

## Now
**0.16.0 is out** — tagged `v0.16.0`, `release/0.16.0` deleted, and `cross-repo-report.yml` on
`main` for the first time, which is what lets its `schedule:` fire at all. Everything that had
piled up on `dev` unshipped went with it: `TEMPLATE_VERSION` and the `src/` seams (#168/#170), the
fleet dashboard and its launchd agent (#169, #172, #173), the `Stop`-hook status refresh (#171) and
the context diet (#174).

Since the release, four smaller things on `dev`: `scripts/provision-cross-repo-app.sh` (#180),
three stale pointers in `.claude/agents/` to a moved workflow and two skills that never existed
(#181), and a docs catch-up correcting two places that still described the cross-repo report as
unbuilt (#182).

**In flight: PR #183** gives `eas-preview.yml` a `paths-ignore` (#160). It had none, so every
docs-only, CI-only or tooling-only push to `dev` ran the full `[ios, android]` matrix — ~2h30m of
EAS time for a byte-identical binary. Checked against real history: **19 of the last 30 pushes to
`dev` would have skipped**, 11 of them on `scripts/**` alone. Two calls stated in the PR —
`scripts/**` is safe only while nothing in it runs at build time (recorded as an invariant in the
workflow header), and ignoring `.github/**` costs the workflow its own self-trigger, so
`workflow_dispatch` came with it. Found downstream in MealCart.

A session-long plan for the wider goal (one dashboard, apps that adopt template releases
themselves, a site that stays current) is at `~/.claude/plans/i-want-to-make-dreamy-zebra.md`.

## Next
- **Propagate #183 to MealCart and tick.** MealCart's `eas-preview.yml` is on its `skip` list in
  `.github/shared-paths.json`, so the drift report will not surface it — this has to be carried by
  hand. It already merged the narrower list in `mealcart#133` and already has `workflow_dispatch`,
  so **only `scripts/**` needs to travel**, and its `main` trigger must not be copied across in
  either direction. tick is full-scope and will show up in the report normally.
- **MealCart is missing `clearByPrefix` from `storage.ts`** — the account-deletion purge helper —
  found by #168's first run. It sits on the path the Play Data Safety work depends on. Still
  undecided whether to open an issue downstream; it has carried over two sessions now.
- **Watch the first scheduled `cross-repo-report.yml` run.** It has never fired: the workflow only
  reached `main` with 0.16.0, and `schedule:` fires from the default branch. First real proof that
  the org App works from a cron rather than a `workflow_dispatch`.

## Blockers
None. The GitHub App is provisioned and no longer gates anything — that entry stood here long
after it stopped being true, which is the failure worth remembering from the 0.16.0 session.

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
