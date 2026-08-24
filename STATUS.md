# [APP_NAME] — Status

_Updated: 2026-08-24_

**Version:** 0.14.0 (on `main`, tagged `v0.14.0`)   **Stage:** Template / pre-app

## Now
Template repo at 0.14.0. **tick's drift is fully triaged** — the work #151 deferred when it built
the mechanism. Three PRs are open and green across two repos, none merged, all reviewable
independently.

**The advisory half was the point, and it paid.** Seven paths are compared by *commit subject*
rather than content, because they are shared in shape but legitimately carry app-specific prose —
tick's `.maestro` flows differ from ours by 59 lines, 58 of them correct. Reading them per subject
rather than per file found one real thing, and it is a shape worth naming: **a fix whose code
travelled upstream while its documentation stayed behind.** `e2e-contract.test.ts` has carried
`CTA_TAP` and a full docblock since `tick#17` landed, but `docs/testing.md` never gained the
section, so the one thing a person adding another reference to `onboarding-cta` needs to know lived
only in a regex comment. A content diff would have said "identical" and moved on. Same file also
still described a 60-second assertion timeout against flows that have waited 180s since `tick#14`
measured a 54,161 ms cold first-bundle serve. Fixed upstream in **#158**.

**The other five advisory paths carried nothing, and that is now written down.** `e2e-contract.test.ts`
and both `docs/backends/*.md` are byte-identical to tick despite six diverged subjects each; the two
`.maestro` flows differ only in prose that is correct where it sits. The verdicts live in tick's
entry in `.github/shared-paths.json`, because **the history section never empties** — an app adopts
template work in squashed `chore: sync template x.y.z` commits, so every subject on both sides of a
squash reads as one-sided forever. A non-empty section is the resting state, not a backlog. Without
a written verdict per path, every future run re-derives the whole read.

**Downstream, `tick#21` ships `drift-report.sh` and the manifest without either prose section that
explains them** — both live in advisory-mode files it correctly declined to overwrite. `tick#22`
adds them, rendered for that side of the boundary rather than copied: from tick the default
direction is app → template, the template is public so no auth is needed, and `#14`/`#17` are local
issue numbers while `#145` is not.

**A new failure mode surfaced while writing it (#159).** A comment saying "on this repo the job
hits the bootstrap gate and skips" is true here and false in every app `init.sh` copies it into —
and unlike the `\[APP_NAME\]` placeholder bug #157 fixes, nothing rewrites these, so they arrive
downstream intact and wrong. `docs/testing.md` is advisory, so both sides are now worded to survive
the copy. `.github/workflows/maestro-e2e.yml` carries two more and is `identical` mode, which
leaves no downstream escape hatch: correcting it in tick would trade a wrong comment for permanent
content drift. It has to be reworded here, and #157 is currently editing one of those exact lines.

## Next
- **Merge the three drift PRs, in order.** Template **#157** (the `init.sh` placeholder root cause)
  before **#158** — they conflict additively on `CHANGELOG.md`'s `## [Unreleased]`, where the rule
  is keep *both* entries, and touch different regions of `.github/shared-paths.json`. Then tick
  **#21** before **#22**, since #22 documents the files #21 delivers. All three are green and
  `MERGEABLE`; #22 touches nothing #21 touches, so the ordering is a merge constraint, not a review
  one.
- **Provision the GitHub App, then close the loop on #154.** Unchanged and still the one deliverable
  a session structurally cannot do for itself — creating a GitHub App is browser-only, and org
  secrets need an `admin:org` scope `gh` does not request. Steps in
  `.claude/reference/cross-repo-token.md`. Then dispatch `verify-privacy.yml` (expect green + skip)
  and `publish-privacy.yml` (expect token minted, then clean skip) here.
- **tick store-readiness audit.** The drift sessions were its prerequisite precisely so a release
  would not discover that tick's `.maestro` and `docs/testing.md` were behind on E2E fixes. They no
  longer are. This is session 5a of the post-#155 plan and the gate on the whole store push.
- **Sweep #159 across the shared surface** once #157 lands. Not a bulk replace — plenty of "this
  repo" instances are correct either side (`docs/testing.md:3`), so each needs reading.
- **Re-triage MealCart's `skip` array**, and decide whether WildFocus and vestia are worth
  comparing at all. tick is done; the other three have had no pass. MealCart's 21 entries are a
  first-pass "known absent", not a verified reading.
- **Run `provision-supabase.sh` against a real Supabase org, from a generated app.** CI can only
  ever reach `--dry-run`, and it cannot be validated here: `env.js` is `BACKEND = "none"` by design
  and the script's preflight refuses.

## Blockers
None.

- **`provision-supabase.sh` has never run against a live Supabase account**, and structurally
  cannot be run from this repo — `env.js` here is `BACKEND = "none"` by design, and the script's
  preflight refuses on exactly that. Same shape as the RevenueCat and E2E entries below: CI proves
  the plumbing (`--dry-run` covers argument parsing, both preflight gates, and every request body),
  and the rest is discovered downstream by construction. What a dry run cannot reach is everything
  involving Supabase's actual responses — the `ACTIVE_HEALTHY` poll, the publishable-vs-legacy key
  selection, and whether the three post-schema assertions read `true` off a real Postgres.

Four things worth carrying forward, none of them blocking:

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
