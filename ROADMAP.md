# [APP_NAME] — Roadmap

> The **template's own** roadmap — what this starter kit has and what it still needs.
> `scripts/init.sh` replaces this file with a fresh starter roadmap when you bootstrap an app,
> so a generated app never inherits these phases.
>
> `/standup` computes progress bars from the `## Phase` headings and their checkboxes;
> `/wrap` checks boxes off as work ships. Headings **must** start with `## Phase`.

## Phase 1 — Template Foundation
- [x] Expo SDK 56 / React Native 0.85 baseline, New Architecture enabled
- [x] Expo Router file-based navigation with `(auth)` / `(tabs)` route groups
- [x] Design-token theme (`src/theme/`) consumed through `useTheme()`
- [x] Zustand stores for app, auth, onboarding and paywall state
- [x] Onboarding, auth, paywall, settings and network-error screens
- [x] Dev mode behind the version-scoped key, plus the `isDevBuild` gate (`src/env.ts`)
- [x] `scripts/init.sh` one-shot bootstrap, smoke-tested in CI (#75)
- [x] Auth port with Supabase and Firebase adapters via `scripts/add-backend.sh` (#76)
- [x] Apple and Google sign-in via `scripts/add-social-auth.sh` (#70)
- [x] Supabase free-tier keep-alive — a generated app's project auto-pauses after 7 days idle,
      and nothing in the backend adapter prevents it (#140)
- [x] Backend docs cover free-tier idle/dormancy behaviour (#141)
- [x] One-command Supabase provisioning via the Management API — `scripts/provision-supabase.sh`
      collapses the manual dashboard steps `add-backend.sh` used to print (#149)

  > No Firebase equivalent is planned, deliberately: non-interactive auth needs a GCP service
  > account that itself needs a pre-existing project, and `projects:create` is gated by
  > per-account quota and billing. Written up in `docs/backends/firebase.md` rather than left
  > as a permanently-open box.

## Phase 2 — Test & CI Hardening
- [x] React Native screen-test harness (#77)
- [x] Screen render tests for onboarding, auth, paywall and settings (#78)
- [x] Dev-only seed-session seam so the app is E2E-drivable with no backend (#79)
- [x] Wiring a backend leaves the Jest suite green (#100)
- [x] Coverage collection and thresholds gated in CI, with a floor of its own for `src/services/` (#111)
- [x] Service-layer unit tests — analytics, notifications, rating, haptics (#111)
- [x] Auth port validator tests — session/user shape and expiry boundaries (#111)
- [x] Backend adapter contract tests for both Supabase and Firebase (#111)
- [x] Social sign-in module contract tests (#114)
- [x] `scripts/e2e.sh` preflight; `npm run e2e` validated end-to-end against a real simulator (#113)
- [x] Maestro E2E gated pre-merge on PRs to `main`, plus an opt-in `e2e` label (#113)
- [x] Maestro flows addressed by `testID`, guarded by a static contract test (#126, #128)
- [x] Weekly Maestro run on `dev`, plus simulator-crash attribution (#128, #131)
- [ ] E2E job exercised against a real simulator **in CI** — only reachable from a generated app,
      since every run on the template itself skips at the `[APP_SLUG]` gate
- [ ] Harden `template-smoke-test.yml`'s placeholder assertion — **partly done in #157**.
      The escaped-mention problem is solved: the check now filters on the bracket-escape
      itself (`\[APP_`), which is what makes a mention safe, so six bootstrap gates stop
      needing to be named. It also covers `*.yml`/`*.yaml`, whose absence had been hiding
      two live defects. Still open: it greps the bare prefix rather than `\[APP_[A-Z_]+\]`
      as `init.sh` does, and still carries a five-file exclusion list; its `paths:` filter
      still omits the scripts the check reads, which is how `drift-report.sh` broke it
      silently — found while shipping #155
- [x] Maestro flow reliability — the Danger Zone scroll was a no-op and post-gesture assertions
      flaked ~1-in-3; found in a generated app, invisible from here (#143)
- [x] `eas-preview.yml` stops paying for builds a push cannot change — no `paths-ignore` meant
      every docs-only, CI-only or tooling-only push to `dev` ran the full `[ios, android]` matrix,
      ~2h30m of EAS time for a byte-identical binary. 19 of the 30 `dev` pushes before the fix
      qualify. `scripts/**` is the biggest line and holds only while nothing in it runs at build
      time, which the workflow header now records as an invariant. Ignoring `.github/**` costs the
      workflow its own self-trigger, so `workflow_dispatch` came with it. Found downstream in
      MealCart, whose copy merged a narrower list already and triggers on `main` — `scripts/**` is
      the only part that should travel. PR #183 merged; the merge itself was the first push
      it skipped. MealCart follow-up in `mealcart#143` (#160)
- [ ] Comments that say "this repo" invert when `init.sh` copies them downstream —
      `maestro-e2e.yml` tells a generated app its E2E job skips at the bootstrap gate, which is
      backwards. Unlike the placeholder bug they survive bootstrap intact, and `identical` mode
      leaves no downstream escape hatch, so the reword has to happen here (#159)

## Phase 3 — Release & Store Automation
- [x] Automated tag + GitHub Release on merge to `main` (`release.yml`)
- [x] Android EAS build + submit chained from the same run (`android-release.yml`)
- [x] Xcode Cloud post-clone hook for the Expo managed project (`ios/ci_scripts/`)
- [x] Privacy-policy generator and `verify-privacy.yml` drift check
- [x] Google Play Data safety compliance — account deletion, analytics opt-out, policy URL
- [x] Device-level Maestro flow from launch through account deletion (#80)
- [ ] tick store-readiness audit — the drift sessions were its prerequisite, so a release would
      not discover tick's `.maestro` and `docs/testing.md` were behind on E2E fixes. They no
      longer are. Gate on the whole store push
- [ ] Prove `publish-privacy.yml` end to end — nothing in the fleet can exercise it yet: `tick`
      has no `privacy.config.json` and MealCart is outside the generator. Needs tick given a real
      config on a branch first, which it wants anyway (#56)
- [ ] Run `provision-supabase.sh` against a real Supabase org from a generated app — more urgent
      since the redirect-URL guard was inverted for every app that ran it after bootstrap. CI can
      only ever reach `--dry-run`
- [ ] First template-generated app shipped through both stores end to end

## Phase 4 — Monetization & Growth
- [x] RevenueCat wired behind a `PaywallProvider` port rather than into the store directly (#112)
- [ ] Dev-only Showcase screen for smoke-testing template changes (#54)
- [ ] Encrypted-at-rest session option via `LargeSecureStore` (#66)
- [x] A general answer to fixes not propagating between the template and generated apps — the
      boundary written down in `.github/shared-paths.json`, `/wrap` covering the outbound half
      and `scripts/drift-report.sh` the inbound one. Found instance five on its first run
      (`tick#14`). PR #151 merged (#145)

  > Acting on the ~50 drifted paths the report found is separate work, not part of this box.
  > **tick is fully triaged** as of 2026-08-24 — the mechanical half in `tick#21`, the advisory
  > half in #158 (upstream) and `tick#22` (downstream), with the per-path verdicts written into
  > tick's entry in `.github/shared-paths.json` so the next run skims rather than re-derives.
  > mealcart, WildFocus and vestia are untouched.

- [x] The drift report reports accurately — its normalisation masked placeholders on the
      template side only, so every shared file containing one read as drifted permanently —
      5 of tick's 10 content-drift hits, clearable by no action on either repo. It now
      renders the app's real identity into the template side and compares, which cleared the
      noise and surfaced four defects the masking had been hiding. PR #157 merged (#152)
- [x] `init.sh` substitutes placeholders in YAML — PR #157 merged. Its `EXTS` filter never
      covered `*.yml`, so every generated app shipped a 404 security-advisory link and a
      feature-request form addressed to `\[APP_NAME\]`; the CI assertion shared the blind spot
- [x] `provision-supabase.sh`'s un-bootstrapped sentinel tested by shape — PR #157 merged. As
      a literal it was rewritten by `init.sh`, inverting the guard so every newly generated
      app silently configured no OAuth redirect URLs at all
- [x] tick at zero content drift — `tick#21` and `tick#22` both merged 2026-08-24. A drift run
      on 2026-09-20 reports **0 content drift**; what remains is the advisory set, compared by
      commit subject and expected to differ. The two live tick defects it carried (a 404
      security-advisory link, a placeholder-addressed feature-request form) went with it (#145)
- [ ] Act on the drift the report finds for **MealCart, WildFocus and vestia**. tick is
      handled; the other three have not been read since #151. Also re-triage MealCart's
      `skip` array — its 24 entries are a first-pass "known absent", not a verified reading

  > Extending the contract into `src/` (PR #168) surfaced a `storage.ts` difference that was
  > first read backwards. **MealCart has `clearByPrefix` and the template does not.** The
  > template's `deleteAccount` only leaves a comment asking implementers to clear
  > `STORAGE_PREFIX`, so upstreaming the helper is template work (#184). MealCart lacks only the
  > zod-validation overload. MealCart is also missing `src/env.ts` and both service ports entirely — left
  > reported rather than skipped, because deciding it does not need the ports is a product call.
- [x] Cross-repo privacy auto-PR workflow (#56) — `publish-privacy.yml` opens a reviewed PR on
      the Pages repo, and the shared token decision was taken with it: one org-owned GitHub App,
      two org secrets, `.claude/reference/cross-repo-token.md`. PR #154 merged. **The App is
      provisioned** and the workflow ran green on 2026-09-20; it is `workflow_dispatch`-only, so
      it had no cron to arm and was provable the same day. `scripts/provision-cross-repo-app.sh`
      (PR #180) turned the browser-only chore into a scripted one, but is disaster-recovery
      rather than a pending step — its creation path cannot run while the App exists.
      Proving it against a *real* app config is separately tracked in Phase 3
- [x] Fleet inventory — `scripts/fleet-report.sh` / `/fleet` answers "what database does each app
      use, what shipped last, what needs attention" across the org in one screen. Hand-maintains
      nothing: the repo list comes from `gh repo list`, so a new app appears the moment it exists.
      Database verdicts print their evidence, and are inferred from `package.json` where `env.js`
      is absent — which is three of the four apps, and the only reason a Capacitor app and a
      pre-template Expo app are legible alongside the rest. PR #162 merged
- [x] Scheduled cross-repo drift **and** fleet report — `cross-repo-report.yml` runs both weekly
      and writes them to the run summary, and `sync_clone` now authenticates with `GH_TOKEN`
      instead of cloning anonymously. PR #166 merged. It covers the half a local script
      structurally cannot: a repo nobody is editing, in a week nobody thought to look. Skips
      cleanly where the org App is not configured — which is still everywhere (#145, #163)
- [x] `scripts/drift-report.sh` and `scripts/fleet-report.sh` added to `limitedScope`, so
      WildFocus and vestia stop being told to adopt `/fleet` the command without the script it
      calls. PR #166 merged
- [x] Version-aware boundary — `TEMPLATE_VERSION` records which template release an app is on
      (replacing a commit-subject grep that degraded silently on squashed or transferred
      history), and the contract extends into the template's own seams: `src/env.ts`, `env.js`,
      `storage.ts`, `useTheme.ts`, the spacing scale and both service ports. The paywall adapter
      was tracked while the port it plugs into was not. `bump-version.sh` moves the file in the
      template and deliberately leaves it alone in a generated app. PR #168/#170 merged
- [x] Fleet dashboard — `fleet-report.sh --html` renders the same data `--json` exposed into one
      self-contained page (`scripts/fleet-html.mjs`), and `install-fleet-agent.sh` installs a
      launchd agent refreshing it every 3 hours, so it is current without a command being typed.
      Output lands in `~/.focalstudio/`, outside the repo, so fleet data about private apps
      cannot be committed to this public template by accident. The agent proves whether it can
      read the repo directly rather than guessing at macOS TCC state, because a wrong guess
      leaves a plausible-looking stale page. Framework-aware: version-outlier detection compares
      only within a framework, so a Capacitor app and an Expo app are not drift.
      PRs #169, #172, #173 merged
- [x] Status tracking maintained without being asked — the `Stop` hook hands the session the
      commit subjects and the rules and has it write `STATUS.md`/`ROADMAP.md` before stopping,
      rather than telling the user to run `/wrap` at the one moment nobody wants to type another
      command. Bounded: two files, a `chore:` commit on a feature branch only, never a push,
      and announced in one line. PR #171 merged
- [x] Context diet — `.claude/CLAUDE.md`, `AGENTS.md` and `.claude/SKILLS.md` enter every
      session and roughly a fifth of them restated each other. Five sections moved behind
      pointers into `.claude/reference/`; 54,438 → 40,788 bytes. PR #174 merged
- [ ] Resolve `react-native-reanimated`'s 25–30% memory regression on SDK 56 (#67)
