# [APP_NAME] — Status

_Updated: 2026-09-24_

> Narrative only. Version, release age, CI, unreleased commits, roadmap percentage and
> template currency are **derived** — they live on the dashboard
> (`~/.focalstudio/fleet.html`, refreshed every 3 hours) and in `/standup`, both computed
> from git and the GitHub API. Restating them here meant maintaining by hand a number a
> script already knew, which is how this file went stale at 0.14.0 while `main` was on
> 0.15.0. Keep this file to what no script can derive: what is going on, what is next,
> and what is in the way.

## Now
**A roadmap for clearing the backlog is set.** Every open issue and PR has a slot in a fix order.
A private status board tracks live state (https://claude.ai/artifact/7oxwzagJ1hhMpM47DozqQT), and
the plan is in `~/.claude/plans/make-a-plan-on-crispy-peacock.md`. Done on 2026-09-24:

- PR #185 merged, and #160 closed by hand (shipped in #183).
- The 0.16.0 QA review's unfiled nits are now #187, grouped into batches A/B/C by file. The
  leftover smoke-test box is #188.
- Four planning labels synced and applied: `next-release`, `qa-review`, `parked`, `tracking`.
- **PR #186 (open)**: one issue per session. Anything else a session finds goes to `PARKING.md`,
  and gets triaged at release step 4b. The rule is in `AGENTS.md`, so it travels to every app.

## Next
- **Merge #186**, then work Wave 1, one fresh session per issue: **#184** (can run in parallel with
  **#176** in a worktree), then **#175**, then **#177**. Batches A and B of #187 follow if there is
  time. **0.17.0 target: Wed 2026-09-30.**
- **The first scheduled `cross-repo-report.yml` run is Mon 2026-09-28 at 08:00 UTC.** It runs
  0.16.0 code, so it stays green even if it crashes; read the log by hand. The #175 fix is first
  proven on the 2026-10-05 run.
- 0.18.0 (target 2026-10-14): #187 batch C, #159, #153, #188, #54.

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
