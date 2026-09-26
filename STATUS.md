# [APP_NAME] — Status

_Updated: 2026-09-25_

> Narrative only. Version, release age, CI, unreleased commits, roadmap percentage and
> template currency are **derived** — they live on the dashboard
> (`~/.focalstudio/fleet.html`, refreshed every 3 hours) and in `/standup`, both computed
> from git and the GitHub API. Restating them here meant maintaining by hand a number a
> script already knew, which is how this file went stale at 0.14.0 while `main` was on
> 0.15.0. Keep this file to what no script can derive: what is going on, what is next,
> and what is in the way.

## Now
**Wave 1 of the backlog plan is under way.** The fix order and live state are on the board
(https://claude.ai/artifact/7oxwzagJ1hhMpM47DozqQT), and the plan is in
`~/.claude/plans/make-a-plan-on-crispy-peacock.md`.

- PR #191 merged (#176): `drift-report.sh` no longer writes `GH_TOKEN` into cached clones'
  `.git/config`. The CI-only drift exit 1 it could not explain is parked in `PARKING.md`.
- **PR #192 (open) fixes #175.** A script that dies now fails `cross-repo-report.yml`. So does
  `drift-report.sh` when it can't fetch a repo, which used to print "Clean" regardless. Found drift
  or flags still pass. Both scripts print `failed at stage: <stage>[:<owner/repo>]` on a non-zero
  exit, and the workflow publishes only a line that matches that exact format. Every outcome goes
  out as an annotation. The dispatched run 36244777904 went red as expected, with
  **`compare:focalstudio/tick`**, and that stage is now in the `PARKING.md` entry. Copilot's three
  threads and a self-review have been addressed.

## Next
- **Merge #192**, then take the parked `compare:focalstudio/tick` runner failure as its own issue.
  It exits 1 only on ubuntu, and it stops the report before mealcart, WildFocus and vestia. Then
  **#177**, and #187 batches A and B if there is time. **0.17.0 target: Wed 2026-09-30.**
- **The first scheduled `cross-repo-report.yml` run is Mon 2026-09-28 at 08:00 UTC.** It still runs
  from `main`, without #192, so it will be green whatever happens. Read its log by hand.
- 0.18.0 (target 2026-10-14): #187 batch C, #159, #153, #188, #54.

## Blockers
None new. `gh` now has the `workflow` scope, but git's keychain token predates it. Plain
`git push` of a workflow change is rejected until `gh auth setup-git` is run. Until then, push
with `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`.

The GitHub App is provisioned and no longer gates anything. That entry stayed here long after it
stopped being true, which is the failure worth remembering from the 0.16.0 session.

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
