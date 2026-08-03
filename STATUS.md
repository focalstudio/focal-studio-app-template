# [APP_NAME] — Status

_Updated: 2026-08-02_

**Version:** 0.9.0   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app. Auth backend work landed this session: Sign in with Google shipped for both Supabase and Firebase (#70, PR #102), alongside the Supabase CI verification and typed-database work that merged just before it (#64, #68, PR #101). Apple sign-in (#62) and the dev sign-in bypass (#39) also shipped earlier and were only just closed — none of this reaches `main` until the next release, since template PRs target `dev`.

## Next
- PR #103 (social sign-in store-submission checklist) needs review/merge.
- **#100 is open and current**: wiring either backend leaves 6 Jest suites red (`app-config`, both dev-button tests, and three `(auth)` screen tests) — confirmed still reproducing against today's `dev` tip. Worth fixing before the next person wires a backend and hits it cold.
- Run the bootstrap flow (`app-bootstrapper`) to turn this template into a real app.
- Replace the placeholder `STATUS.md` / `ROADMAP.md` content with the new app's real phases.
- Swap placeholder splash/icon assets before the first EAS build.

## Blockers
None — #100 above is a known issue, not a blocker on current work.
