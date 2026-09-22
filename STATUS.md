# [APP_NAME] — Status

_Updated: 2026-09-21_

> Narrative only. Version, release age, CI, unreleased commits, roadmap percentage and
> template currency are **derived** — they live on the dashboard
> (`~/.focalstudio/fleet.html`, refreshed every 3 hours) and in `/standup`, both computed
> from git and the GitHub API. Restating them here meant maintaining by hand a number a
> script already knew, which is how this file went stale at 0.14.0 while `main` was on
> 0.15.0. Keep this file to what no script can derive: what is going on, what is next,
> and what is in the way.

## Now
**Release 0.16.0 is being cut.** The whole plan-length arc landed on `dev` in one stretch and none
of it has shipped: `TEMPLATE_VERSION` and the `src/` seams (#168/#170), the fleet dashboard and its
launchd agent (#169, #172, #173), the `Stop`-hook status refresh (#171) and the context diet (#174).
The headline for the release notes is that **`cross-repo-report.yml` reaches `main` for the first
time**, which is what makes the weekly scheduled drift + fleet report able to run at all (#161).

`qa-reviewer` audited `origin/main...origin/dev` first — 28 files, +2356/−312, almost all shell,
workflows and a 1009-line HTML renderer rather than React Native, so it was weighted at `set -euo
pipefail` interactions, `jq` on non-JSON input and HTML escaping in `scripts/fleet-html.mjs`
(escaping came back sound). It found one blocker: `cross-repo-report.yml` wrote both report bodies
into a run summary that is world-readable on a public repo, while the reports describe private
apps. Fixed on the release branch — the summary now carries counts only. The three should-fixes
are deferred to #175, #176 and #177.

A session-long plan for the wider goal (one dashboard, apps that adopt template releases
themselves, a site that stays current) is at `~/.claude/plans/i-want-to-make-dreamy-zebra.md`.

## Next
- **The GitHub App is already provisioned** — `FOCALSTUDIO_BOT_APP_ID` and
  `FOCALSTUDIO_BOT_PRIVATE_KEY` have been org secrets since 2026-09-20 and 2026-08-11. This file
  and the reference doc both said otherwise, and a release was nearly cut on that assumption:
  `cross-repo-report.yml` had not run only because `schedule:` fires from the default branch and
  the file had not reached `main`. Merging 0.16.0 arms it for real. `scripts/provision-cross-repo-app.sh`
  (PR #180) is therefore documentation and disaster-recovery, not a pending task — its creation
  path has never run and cannot be exercised while the App exists.
  The App was exercised the same day it was created: `publish-privacy.yml` ran green on
  2026-09-20. It is `workflow_dispatch`-only, so it has no cron to arm — which is why it was
  provable immediately and `cross-repo-report.yml` was not.
- **Merge the two release PRs**, then delete `release/0.16.0` by hand. Never `--delete-branch` on
  the main PR: it auto-closes the backmerge.
- **MealCart is missing `clearByPrefix` from `storage.ts`** — the account-deletion purge helper —
  found by #168's first run. It sits on the path the Play Data Safety work depends on. Decide
  whether to open an issue downstream.

## Blockers
None. The GitHub App is provisioned and no longer gates anything — that entry stood here long
after it stopped being true, which is the failure worth remembering from this session.

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
