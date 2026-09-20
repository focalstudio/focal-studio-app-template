# [APP_NAME] — Status

_Updated: 2026-09-20_

**Version:** 0.14.0 (on `main`, tagged `v0.14.0`)   **Stage:** Template / pre-app

## Now
`/fleet` shipped — `scripts/fleet-report.sh` inventories every repo in the org (database, last
release, unreleased commits, CI, open work, roadmap bar) with no manifest to maintain. PR #162 is
green and mergeable into `dev`; #163 tracks the scheduled version, which shares the drift report's
GitHub App blocker.

## Next
- **Propagate `/fleet` to the apps.** A drift run against tick shows 0 content drift and exactly
  two missing shared paths — `scripts/fleet-report.sh` and `.claude/commands/fleet.md`, both
  created this session. Note `scripts/*` is not in `limitedScope` while `.claude/commands/*.md`
  is, so WildFocus and vestia would be told to take the command without the script it calls.
- **Provision the GitHub App, then close #154 and unblock #163.** Still the one deliverable a
  session structurally cannot do for itself — a browser-only flow, and org secrets need an
  `admin:org` scope `gh` does not request by default. Steps in
  `.claude/reference/cross-repo-token.md`. It now blocks two scheduled reports, not one.
- **Act on what `/fleet` surfaced.** MealCart and WildFocus both have commits on `main` past
  their last tag, and vestia is on Expo SDK 54 against the fleet's 56.

Everything else that was listed here is a ROADMAP box and was being maintained twice; the roadmap
is the backlog, this section is only for work with no phase.

## Blockers
None.

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
