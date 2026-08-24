# [APP_NAME] — Status

_Updated: 2026-08-24_

**Version:** 0.14.0 (on `main`, tagged `v0.14.0`)   **Stage:** Template / pre-app

## Now
Template repo at 0.14.0. **Two PRs open and green, neither merged:** `#157` here and `tick#21`
downstream. This session acted on the drift the report found — and found that the report was
itself the largest single source of it.

**`drift-report.sh` was calling half its content drift falsely, and hiding real defects doing
it.** Normalisation masked `\[APP_NAME\]` and friends to a sentinel **on the template side only**.
The app side never says `\[APP_NAME\]` — it says `Tick`, and always will — so the two sides could
not match, and every shared file containing a placeholder read as drifted **permanently**,
clearable by no action on either repo. Five of tick's ten content-drift hits were that and
nothing else, in a report whose whole value is that someone still reads it.

It now **renders** instead of masking: doing to the template side what `init.sh` did to the app,
substituting the app's real identity — read from its own `app.json` and `origin` remote, so there
is nothing to configure per app — then comparing bytes. Substitution fires only where a
placeholder literally appears, so unlike a reverse substitution (`Tick` → sentinel on the app
side) it cannot mask a real difference in a line that merely contains the app's name; for a slug
like `tick`, an ordinary English word, it certainly would have.

**Unmasking surfaced two defects live in every generated app**, both from `init.sh`'s `EXTS`
filter never covering `*.yml` — and the CI placeholder assertion used the same extension list,
which is exactly why neither was ever caught:

- The **"Report a security vulnerability" link was a 404** — `config.yml` shipped
  `github.com/\[GITHUB_REPO\]/security/advisories/new`. Anyone trying to report privately had
  nowhere to go. The feature-request form greeted contributors as `\[APP_NAME\]`.
- **`provision-supabase.sh` configured no OAuth redirect URLs for any newly generated app.** Its
  guard compared the scheme against a literal `"\[APP_SLUG\]"`, but `init.sh` rewrites that token
  in every `.sh` — so it became `[ "$SCHEME" != "myslug" ]` against an `app.json` whose scheme
  *is* `myslug`. Inverted. Its own comment calls that the single most common way the OAuth recipe
  fails.

**A convention came out of it:** prose that *documents* a placeholder is now written
bracket-escaped, `\[APP_NAME\]` — the form the six workflow bootstrap gates already use.
Unescaped, `init.sh` rewrites it like any other occurrence, which is how tick ended up carrying
the instruction "Leave `Tick`, `tick`, `com.focalstudio.tick`, `#5B6CE8` … as-is in identity
fields — `init.sh` replaces them". The CI assertion now filters on that escape rather than a
hand-maintained filename list; six gates depend on it today and the seventh would not have been
added to a list.

**`templates/licenses/*` is settled — excluded from the manifest, not copied down.** `init.sh` is
its only consumer and is already excluded from `scripts/*`; shipping a consumer's inputs while
excluding the consumer is incoherent, and copying buys a quiet report with two dead files in
every app forever. The reasoning is recorded in `shared-paths.json` so it is not re-derived a
third time.

**tick is now at zero content drift and zero missing shared paths** (`tick#21`). What remains
there is the advisory set — `.claude/CLAUDE.md`, the `.maestro` flows, `docs/*`,
`e2e-contract.test.ts` — compared by commit subject and expected to differ.

## Next
- **Merge `#157`, then `tick#21`.** Both green. `tick#21` carries the two live tick defects and
  depends on `#157` only for the `init.sh` root-cause fix — the repairs stand on their own.
- **Provision the GitHub App, then close the loop on #154.** Still the one deliverable a session
  structurally cannot do for itself: creating a GitHub App is a browser-only flow with no API
  path, and setting org secrets needs an `admin:org` scope `gh` doesn't request by default. Steps
  are in `.claude/reference/cross-repo-token.md`. Once the two secrets exist, dispatch
  `verify-privacy.yml` here (expect: still green, still skipping) and `publish-privacy.yml` here
  (expect: token minted, then clean skip).
- **Run the drift report against MealCart, WildFocus and vestia.** tick is handled; the other
  three have not been read since #151, and the report is now accurate enough to be worth reading.
  Re-triage MealCart's `skip` array while there — its 21 entries are a first-pass "known absent",
  not a verified reading.
- **Finish hardening `template-smoke-test.yml`'s placeholder assertion.** #157 solved the
  escaped-mention half and added `*.yml`/`*.yaml` coverage. Still open: it greps the bare prefix
  rather than `\[APP_[A-Z_]+\]` as `init.sh` does, still carries a five-file exclusion list, and
  its `paths:` filter still omits the scripts the check reads.
- **Nothing in the fleet can exercise the privacy PR path yet.** `tick` has no
  `privacy.config.json`, MealCart is outside the generator. Proving `publish-privacy.yml` end to
  end means giving tick a real config on a branch first — which it needs anyway.
- **Run `provision-supabase.sh` against a real Supabase org, from a generated app** — and note
  this is now more urgent than it was, since the redirect-URL guard was inverted for every app
  that ever ran it after bootstrap. CI can only ever reach `--dry-run`.
- **First generated app through both stores end to end** — the last unchecked box in Phase 3.

## Blockers
None.

- **`provision-supabase.sh` has never run against a live Supabase account**, and structurally
  cannot be run from this repo — `env.js` here is `BACKEND = "none"` by design, and the script's
  preflight refuses on exactly that. Same shape as the RevenueCat and E2E entries below: CI proves
  the plumbing (`--dry-run` covers argument parsing, both preflight gates, and every request body),
  and the rest is discovered downstream by construction. What a dry run cannot reach is everything
  involving Supabase's actual responses — the `ACTIVE_HEALTHY` poll, the publishable-vs-legacy key
  selection, and whether the three post-schema assertions read `true` off a real Postgres.

Five things worth carrying forward, none of them blocking:

- **Any app bootstrapped after `provision-supabase.sh` landed has the inverted redirect-URL
  guard.** #157 fixes the template, but nothing back-fills. tick escaped it by accident — the file
  reached tick by sync, *after* bootstrap, so its literal sentinel survived and the guard worked —
  and `tick#21` carries the shape-tested version anyway. Worth checking MealCart, and worth
  remembering that "the template is fixed" and "the fleet is fixed" are different claims.

- **Propagation now has a mechanism, but the fleet is not homogeneous and the report is still
  local-only.** #145 is answered and merged (#151), so this is no longer "someone has to remember" — but
  two caveats survive. First, only `tick` and `mealcart` are true descendants: **WildFocus is a
  Capacitor + Vite app**, and vestia predates the current layout, so both are compared on a
  deliberately tiny `limitedScope` slice and a uniform diff across all four would be ~90% noise.
  Second, the **scheduled** version of the report is not built. That is no longer blocked on a
  decision — #56's org-owned GitHub App covers both consumers and is written up in
  `.claude/reference/cross-repo-token.md`. What remains is the workflow itself plus token auth in
  `drift-report.sh`'s `sync_clone`, which still clones anonymously over HTTPS and so cannot read a
  private sibling at all. The local script covers the need until the fleet grows.
- **The E2E job has still never run against a real simulator in CI *on this repo*** — every run
  skips at the `[APP_SLUG]` gate, including the weekly `dev` cron. This is structural, not a gap to
  close: a template has no app to drive, so runtime defects in `.maestro/*.yaml` are discovered
  downstream **by construction**. Same shape as #140 itself, which MealCart found live. Do not add
  the `e2e` label to a template PR expecting a signal.
- **The RevenueCat adapter has never run against a live RevenueCat project.** CI proves the wiring
  (`Wire RevenueCat Paywall` and `Wire Supabase Backend + RevenueCat Paywall` both green, the
  latter being the only check that catches one `add-*.sh` clobbering the other's selector), and the
  contract test pins `errors.ts` against the SDK's real `PURCHASES_ERROR_CODE` enum. The two traps
  that look like bugs in this code — all subscriptions in one App Store Connect group, and the
  In-App Purchase Key + Server Notifications URL, without which renewals never reach RevenueCat and
  the entitlement listener goes silent forever — are documented in `docs/paywall/revenuecat.md` and
  only reachable from a real app.
- Running the E2E flows locally still needs Metro on **port 8081 specifically** — `RCT_METRO_PORT`
  is baked nowhere in the Expo prebuild, so `--port` moves only the CLI's server, not what the
  installed debug build probes. See the E2E section of `docs/testing.md` for the `RCT_jsLocation`
  workaround when 8081 is occupied.
