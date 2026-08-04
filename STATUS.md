# [APP_NAME] — Status

_Updated: 2026-08-04_

**Version:** 0.10.0   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app. This session validated `npm run e2e` end-to-end for the first time (PR #115, merged to `dev`): both Maestro flows pass **unmodified** against a real simulator, 2/2 in ~50s — they had never actually been executed anywhere, in CI or locally. The flows were fine; the tooling around them was not, so the output is `scripts/e2e.sh` (a preflight turning four silent 60-second timeouts into one-line errors), corrected install and prerequisite docs, and the #113 CI trigger (PRs to `main` plus an opt-in `e2e` label). Three unreleased PRs now sit on `dev` ahead of `main`: #110 (tooling), #111 (coverage gate + service/adapter tests), #115.

## Next
- **#114** — contract tests for `templates/social/*.ts` (547 uncovered lines), reusing #111's copy-on-wire pattern. `templates/` gets zero CI checking until copied (both `tsconfig.json` and `eslint.config.js` exclude it), so it has to be verified by actually running the script.
- **Cut release 0.11.0** — test/CI hardening as its own release theme, carrying #110, #111 and #115 to `main`. This is also what finally auto-closes #113.
- **#112** — RevenueCat behind a `PaywallProvider` port, deliberately held for 0.12.0 so a red integration can't block the already-proven coverage work.

## Blockers
None.

Three things worth carrying forward, none of them blocking:

- #113 stays **open** despite shipping in #115 — `Closes` only fires on merges to the default branch, and template PRs target `dev`. It closes when 0.11.0 reaches `main`.
- The E2E job #113 adds has never actually driven a simulator in CI; every run on this repo skips at the `[APP_SLUG]` gate. It is validated as wiring only, and gets its first real exercise in an app generated from this template.
- Running the flows locally needs Metro on **port 8081 specifically** — `RCT_METRO_PORT` is baked nowhere in the Expo prebuild, so `--port` moves only the CLI's server, not what the installed debug build probes. See the E2E section of `docs/testing.md` for the `RCT_jsLocation` workaround when 8081 is occupied.
