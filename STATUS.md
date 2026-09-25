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
- **#175 is committed on `fix/cross-repo-report-fails-on-death` but not pushed.** A script that
  dies now fails `cross-repo-report.yml`. Found drift or flags still pass. Both scripts print
  `failed at stage: <stage>[:<owner/repo>]` on a non-zero exit. The workflow publishes only a line
  that matches that exact format, and it sends every outcome as an annotation, so `gh run view`
  can read it. Verified locally: success, the `setup`/`preflight`/`auth` failures, the regex and
  actionlint all pass.

## Next
- **Push #175 and open its PR to `dev`**, then dispatch `cross-repo-report.yml` on the branch. **Expect
  red**: the drift step should name its failing stage. Record that stage in the `PARKING.md` entry,
  then fix it in its own session. Then **#177**, and #187 batches A and B if there is time.
  **0.17.0 target: Wed 2026-09-30.**
- **The first scheduled `cross-repo-report.yml` run is Mon 2026-09-28 at 08:00 UTC.** Once #175 is
  on `dev`/`main`, a crash shows red rather than green.
- 0.18.0 (target 2026-10-14): #187 batch C, #159, #153, #188, #54.

## Blockers
- **Pushing workflow changes needs the `workflow` scope.** The `gh` token has `repo`, `admin:org`,
  `admin:public_key` and `gist`, and there is no SSH key, so GitHub rejects any push that touches
  `.github/workflows/`. Fix: `gh auth refresh -h github.com -s workflow` (interactive).

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
