# [APP_NAME] — Status

_Updated: 2026-09-23_

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

**#160 shipped (PR #183).** `eas-preview.yml` now ignores pushes that cannot change the bundle.
Checked against history, 19 of the last 30 pushes to `dev` would have been skipped. It was also
checked live: CI ran on the merge commit and EAS Preview did not. The three pushes before it,
including the docs-only #182, each started a build. The `workflow_dispatch` trigger has not been
clicked yet. It should stop at the `[APP_SLUG]` check within seconds.

**One note in this file was backwards.** For two sessions Next said "MealCart is missing
`clearByPrefix`". MealCart has it and the template does not: the template's `deleteAccount` only
has a comment asking implementers to clear `STORAGE_PREFIX`. That is now template issue #184.

A session-long plan for the wider goal (one dashboard, apps that adopt template releases
themselves, a site that stays current) is at `~/.claude/plans/i-want-to-make-dreamy-zebra.md`.

## Next
- **#184: upstream `clearByPrefix`** and have `deleteAccount` clear `STORAGE_PREFIX` plus
  scheduled notifications, only after the server delete succeeds. It is Play Data Safety work,
  and until it lands every app generated from the template keeps a deleted user's data on the
  device.
- **Review `mealcart#143`.** It adds `scripts/**` to MealCart's list. It saves 0 builds over
  MealCart's last 18 pushes to `main`, because those are releases, so its value is keeping the two
  copies aligned. Closing it is reasonable. Related: MealCart ignores `ios/ci_scripts/**` and the
  template does not, although the template ships that directory too.
- **The first scheduled `cross-repo-report.yml` run is Monday 2026-09-28 at 08:00 UTC.** It will
  be the first time the org App is used from a schedule rather than started by hand.

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
