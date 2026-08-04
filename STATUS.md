# [APP_NAME] — Status

_Updated: 2026-08-04_

**Version:** 0.11.0   **Stage:** Template / pre-app

## Now
Template repo — customise `[APP_NAME]`, replace placeholder assets, then bootstrap a new app.
**0.11.0 is cut as a test/CI hardening release**, carrying five merged PRs from `dev` to `main`:
#110 (Claude tooling simplification), #111 (coverage gate + service, auth-port and backend-adapter
tests), #115 (E2E validated end-to-end, `scripts/e2e.sh` preflight, pre-merge E2E trigger), #116
(status refresh) and #117 (social sign-in contract tests). The theme is deliberate — RevenueCat
(#112) is held for 0.12.0 so a red third-party integration cannot block coverage work that is
already proven green. This release also retires the obsolete "bump `DEV_MODE_KEY` by hand" step
from the release docs (it has been derived from `package.json` since 0.10.0) and stops
`scripts/init.sh` handing new apps the template's own `STATUS.md` and `ROADMAP.md`.

## Next
- **#112** — RevenueCat behind a `PaywallProvider` port, not wired into the store directly. This is
  the 0.12.0 theme.
- **First generated app through both stores end to end** — the last unchecked box in Phase 3, and
  the only way to exercise the parts of the pipeline the template itself can never reach.
- **#54** — dev-only Showcase screen for smoke-testing template changes.

## Blockers
None.

Three things worth carrying forward, none of them blocking:

- **#113 and #114 both stay open until 0.11.0 lands on `main`.** `Closes` only fires on merges to
  the default branch and template PRs target `dev`, so both issues shipped (in #115 and #117) while
  remaining open. Merging this release closes them.
- The E2E job #113 adds has never actually driven a simulator in CI; every run on this repo skips
  at the `[APP_SLUG]` gate. It is validated as wiring only, and gets its first real exercise in an
  app generated from this template.
- Running the flows locally needs Metro on **port 8081 specifically** — `RCT_METRO_PORT` is baked
  nowhere in the Expo prebuild, so `--port` moves only the CLI's server, not what the installed
  debug build probes. See the E2E section of `docs/testing.md` for the `RCT_jsLocation` workaround
  when 8081 is occupied.
