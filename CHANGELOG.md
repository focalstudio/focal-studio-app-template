# Changelog

All notable changes to [APP_NAME] are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

## [0.12.0] — 2026-08-05

### Added
- **`scripts/add-paywall.sh` + the RevenueCat adapter (#112)** — `bash scripts/add-paywall.sh
  revenuecat` installs `react-native-purchases`, drops the adapter into `src/services/paywall/`,
  activates it with a one-line rewrite of the barrel, promotes `EXPO_PUBLIC_REVENUECAT_*` from
  optional to required, and prints the dashboard steps it cannot do for you. The package is
  deliberately **not** a dependency of the template: an app that never monetizes carries no native
  IAP module, no extra EAS rebuild, and no store key at boot. Nothing is added to `app.json` —
  `react-native-purchases` ships no config plugin and is autolinked, so a plugin entry would break
  the build, and CI now asserts one never appears.
- **Auth ↔ paywall identity binding** — `usePaywallStore.init()` calls the port's optional
  `identify()` / `forget()` as the signed-in user changes. Purchase providers alias *anonymous*
  app-user IDs by default, so without this the next person to sign in on a shared device inherits
  the previous user's Pro, and a purchase does not follow its owner to a second device. A provider
  that omits the pair (the local scaffold does) stays in anonymous mode, which is correct for an
  app with no auth.
- **`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `..._ANDROID_API_KEY`** — validated in `env.js` with
  `appl_` / `goog_` prefix regexes. Swapping the two is the classic RevenueCat mistake and surfaces
  at runtime as an opaque "invalid credentials"; this turns it into a build failure. Only the iOS
  key is required, matching the template's iOS-first stance — the adapter asks for the Android key
  at point of use.
- **`PAYWALL` selector in `env.js`**, parallel to `BACKEND` and orthogonal to it, plus
  `extra.paywall` in the manifest and `paywall` in `src/env.ts`. Each `add-*.sh` script rewrites
  only its own constant; a new `supabase-plus-paywall` CI job runs both scripts and asserts neither
  clobbered the other, which is the one failure no single-script job can catch.
- **Two smoke-test jobs** in the (renamed) *Template Integration Scripts Smoke Test* workflow, which
  now covers all three integration scripts. The RevenueCat contract test only becomes runnable once
  `add-paywall.sh` has copied it out of `templates/`, and it carries the only check that
  `errors.ts`'s code table still agrees with the SDK's real `PURCHASES_ERROR_CODE` enum.
- **`docs/paywall/revenuecat.md`** — dashboard setup, the two traps that look like bugs in this code
  (all subscriptions in one App Store Connect group; the In-App Purchase Key + Server Notifications
  URL, without which renewals never reach RevenueCat and the entitlement listener goes silent
  forever), and why `react-native-purchases-ui` is deliberately not wired.
- **`PaywallProvider` port in `src/services/paywall/` (#112)** — the paywall now sits behind the same
  port/adapter shape as `src/services/auth/`: `types.ts` declares the contract, `local.ts` is the
  committed default, and `index.ts` holds the single assignment a future `scripts/add-paywall.sh`
  rewrites. Nothing new is installed — a generated app that never monetizes still carries no in-app
  purchase dependency, no native rebuild, and no store key at boot. The contract states the two
  semantics that get quietly wrong: `getSubscription()` must **never throw and never downgrade on
  doubt** (the inverse of `AuthProvider.getSession()`, because the failure mode here is revoking
  access someone paid for, not trusting an unverified session), and `restore()` resolving "nothing
  found" is a **success**, not an error — while it must still throw when offline, since silently
  telling a paying user they own nothing is the worst outcome of a Restore button.
- **`payment_pending` as a first-class state** — Ask-to-Buy, SCA and slow Play payment methods are
  neither success nor failure. The purchase sheet dismisses, nothing is granted, the copy does not
  apologise, and the entitlement arrives later through the provider's subscription. `app/_layout.tsx`
  now opens that subscription via `usePaywallStore.init()`, which is the only path by which an
  approved deferred purchase can ever reach the app.
- **Pure, CI-covered mapping logic** — `entitlement.ts` (entitlement → tier), `offerings.ts`
  (package selection and ISO-8601 intro-offer copy), `errors.ts` (provider codes → `PaywallErrorCode`)
  and `messages.ts` live under `src/services/` rather than in a future `templates/` directory, so tsc,
  eslint and jest all see them — the same rule that pulled `oauthCallback.ts` and `appleName.ts` out
  of `templates/social/`. `resolveTier` carries one invariant with a test per input class: an active
  entitlement never resolves to `free`.

### Changed
- **`app/paywall.tsx` renders store-localized prices** — the hardcoded `$4.99` / `$29.99` / `$79.99`
  are gone. A literal USD price is wrong in every non-USD storefront and wrong the day it changes in
  App Store Connect, which is an App Store Guideline 3.1.2 problem the template shipped by default.
  With no provider wired the cards show `—` placeholders and stay fully designable. `handleSubscribe`
  and `handleRestore` no longer throw or `TODO` — they go through the store, so the paywall buttons
  are exercised by tests for the first time.

### Breaking
- **`usePaywallStore.setSubscription()` has been removed.** It was a public, synchronous method that
  granted Pro with no payment and persisted it — the entitlement twin of the fake-signup scaffold this
  repo already deleted from auth, and safe until now only because `app/paywall.tsx` threw before
  reaching it. Use `purchase(tier)`, which goes through the port. For tests and dev builds,
  `seedLocalSubscription()` in `src/services/paywall/local.ts` is the replacement seam (not exported
  from the barrel, and inert once a real provider is wired). `isPro` and `tier` are unchanged, so no
  screen that only reads entitlement state needs touching.
- **`storedSubscriptionSchema` moved** from `src/types/schemas.ts` to `src/services/paywall/types.ts`
  — it is paywall-domain, the same reasoning `authSessionSchema` gives. `subscriptionTierSchema` stays
  where it was. A device holding the old bare `{ tier }` blob still reads back correctly: every field
  in the new schema carries its own `.catch()`, so the update does not downgrade a paying user.

---

## [0.11.0] — 2026-08-04

### Added
- **Contract tests for both social sign-in modules (#114)** —
  `templates/social/{supabase,firebase}-social.test.ts`, 29 and 32 tests over the 547 lines
  that had none. `templates/` is excluded from `tsconfig.json`, `eslint.config.js` and Jest's
  `testMatch`, so nothing type-checked, linted or ran these files until an app copied them
  out; `template-backend-smoke-test.yml` checked them with greps alone. Same mechanism as
  #111: authored against their destination, copied by `scripts/add-social-auth.sh` to
  `src/services/auth/__tests__/social.test.ts`, picked up by the two `*-plus-social` jobs'
  existing `npm test` step. Unlike the adapter tests they mock the *adapter* rather than the
  SDK — the subject here is the composition, and that is what makes "reuses the adapter's
  `toAuthSession` / `toAuthError` instead of growing a second mapping" assertable.
  Heaviest on `AuthError("cancelled")`: `useAuthStore` swallows it, so mapping a dismissed
  Apple sheet or OAuth browser to anything else shows a red error for a tap the user
  deliberately took back — the likeliest bug here and invisible to a structural grep. Also
  both Supabase callback shapes (PKCE `?code=` and implicit `#access_token=`, parsed from real
  redirect URLs), Firebase's Apple nonce (Apple gets SHA-256(raw), Firebase gets the raw
  value — swap them and you get `auth/invalid-credential`), Apple's once-ever name capture,
  and that neither method depends on `this`, since both are composed on by object spread.
  The two `*-plus-social` jobs now also assert the test file arrived, because the copy is
  guarded by `[ -f ]` and a rename would otherwise skip it with CI still green.
- **`maestro-e2e.yml` now runs pre-merge, plus an opt-in `e2e` label (#113).** It previously fired
  only via `workflow_call` from `release.yml` (post-release) and `workflow_dispatch`, so there was
  no E2E signal before a merge at all. Now: PRs targeting `main` — release PRs, where a gate is
  worth ~20 minutes of macOS runner — plus any PR carrying the new `e2e` label, for a risky feature
  PR that wants the signal on request. `types:` includes `labeled` because the default
  opened/synchronize/reopened would mean adding the label to an open PR triggered nothing and the
  opt-in looked broken. One job-level `if:` covers both paths; a false `if:` skips without
  allocating a runner, so routine `dev` PRs still cost nothing. **The value here is downstream** —
  on this template the job hits the `[APP_SLUG]` gate and skips; it only becomes a real signal in a
  generated app.
- **`scripts/e2e.sh` — a preflight in front of the Maestro flows.** `npm run e2e` was a one-liner
  that had never actually been run: it assumed Maestro on `PATH`, a JDK, a bootstrapped `app.json`
  and a reachable Metro, and gave nothing back when any of those was missing. Every one of those
  now fails in a second with the fix, rather than as a 60-second silent assertion timeout against a
  red screen. Also quotes the `$(node -p ...)` substitutions, adds an `E2E_METRO_PORT` escape
  hatch, and passes arguments through so a single flow can be run
  (`npm run e2e -- .maestro/persistence.yaml`). Its bootstrap gate tests the *shape* of the
  resolved identifiers rather than grepping `app.json` for placeholder text — deliberately, because
  `scripts/init.sh` rewrites those tokens across `*.sh` as well as source files, so a literal one
  written into this script would be substituted at bootstrap and invert the gate into one that
  fires on every bootstrapped app.

- **Coverage is now gated in CI.** `jest.config.js` gained `collectCoverageFrom` and
  `coverageThreshold`, and `ci.yml` runs `npm test -- --coverage` (the flag is what enforces the
  thresholds — without it Jest collects nothing). `collectCoverageFrom` matters on its own: an
  untested module used to be absent from the report rather than counted as 0%, flattering the
  totals by ~1 point. `src/services/` carries a floor of its own on top of the global one,
  because a single global number cannot protect a layer — the service layer sat at **19%
  statements** while the global average stayed in the mid-70s, carried by well-tested screens
  and stores. New `npm run test:coverage` script.
- **Unit tests for the service layer** (`src/services/__tests__/`): `analytics`, `notifications`,
  `ratingService`, `haptics` — 58 tests taking `src/services/` from 19% to 100% statements.
  Beyond line coverage they pin the behaviours that fail silently on a device: the analytics
  init/hydrate ordering re-apply, `parseTime()` rejecting malformed persisted times instead of
  scheduling at `NaN:NaN`, the rating prompt not burning its once-per-version flag when
  StoreKit was unavailable or the request threw, and the Android channel without which Android
  drops every notification.
- **Tests for the auth port's own validators** (`src/services/auth/__tests__/types.test.ts`):
  `isValidSession` / `isValidUser` against malformed persisted blobs, and `isSessionExpired`
  boundaries including the seconds-vs-milliseconds unit that silently signs everyone out if
  misread.
- **Adapter contract tests for both backends** —
  `templates/backends/{supabase,firebase}/<provider>.test.ts`, 44 and 46 tests. They cover the
  `AuthProvider` mapping (session shape, the full error-code table, `getSession()`'s offline
  rules, and `deleteAccount()` throwing without clearing local state — the claim the app makes
  on Google Play's Data safety form). `scripts/add-backend.sh` copies each one into
  `src/services/auth/__tests__/` alongside its adapter, so **the generated app inherits them**
  and `template-backend-smoke-test.yml`'s existing `npm test` step picks them up with no
  workflow change. This is the first CI checking `templates/**` has ever had — both
  `tsconfig.json` and `eslint.config.js` exclude it, since those files cannot resolve until
  they are copied.
- **`npm run e2e`** runs the Maestro flows against a local iOS Simulator, resolving `APP_ID` and
  `APP_SCHEME` from `app.json` exactly as `maestro-e2e.yml` does so the two cannot drift. Local
  E2E costs nothing and is a far tighter loop than the post-release CI run. Documented in
  `docs/testing.md`.

### Fixed
- **A failed Apple name write reported success on the Supabase backend (#114).** Found while
  writing the tests above, which is the point of them — nothing had ever executed this code.
  `captureAppleName()` in `templates/social/supabase-social.ts` wrapped
  `supabase.auth.updateUser()` in a `try/catch`, but supabase-js reports API failures by
  *returning* `{ error }` and only rejects on a transport failure. So the common failure fell
  straight through and the function returned a session with the name attached — the app showed
  a name the server never stored, and the next `getSession()` silently dropped it. Apple sends
  `fullName` only on the very first authorization ever, so there was no second chance to
  recover it. Both shapes are handled now; a failed write still never fails the sign-in.
- **`.gitignore` silently ignored every new file under `templates/backends/supabase/`.** The
  entry was `supabase/`, unanchored — which matches a directory of that name at *any* depth, not
  just the throwaway `supabase/` that `verify-backend.yml` creates via `supabase init`. The
  existing adapter and `schema.sql` were unaffected only because git keeps tracking files it
  already tracks; anything added there afterwards was invisible to `git status`. Now anchored as
  `/supabase/`.
- **`docs/testing.md` told you to install the wrong software.** It recommended
  `brew install maestro`, which resolves to Homebrew core's cask for *"Maestro (AI agent command
  center)"* from `runmaestro.ai` — an unrelated product. The mobile-testing Maestro ships only via
  `get.maestro.mobile.dev` or `mobile-dev-inc/tap`. Anyone following the docs installed a macOS app
  they did not want and then hit `maestro: command not found`.
- **Two undocumented prerequisites for running the flows locally**, both found by actually running
  them end-to-end for the first time against a bootstrapped throwaway app:
  1. **A JDK 17+ has to be reachable, and Homebrew's is keg-only.** `brew install openjdk@17`
     deliberately does not link the formula onto `PATH`, so you end up with a JDK installed and no
     `java` command, and Maestro's launcher dies on a message that never mentions Maestro. Fixed by
     documenting `export PATH="$(brew --prefix openjdk@17)/bin:$PATH"`. Either `JAVA_HOME` or
     `java` on `PATH` satisfies the launcher — it is the stock Gradle start script and falls back
     to `PATH`. CI never hit this because `actions/setup-java` handles both.
  2. **Metro must be on port 8081.** A Debug build's `RCTBundleURLProvider` probes
     `http://localhost:8081/status` and nothing else — `RCT_METRO_PORT` is baked nowhere in the
     Expo prebuild, so `expo start --port N` / `expo run:ios --port N` move only the CLI's server,
     not what the installed app looks for. With 8081 occupied the app comes up on the red
     "No script URL provided" screen (`unsanitizedScriptURLString = (null)`) and every assertion
     times out with nothing explaining why. Documented along with the `RCT_jsLocation` workaround,
     which survives Maestro's `clearState: true`.
- **`coverage/` was not gitignored.** `npm run test:coverage` and `npm test -- --coverage` write an
  lcov report tree at the repo root, so any local coverage run left ~90 untracked files sitting in
  `git status`, easy to sweep into a commit by accident. CI never noticed because it never commits.
- **Corrected the cost premise in `maestro-e2e.yml`'s header.** It claimed macOS runners are
  "billed at a 10x minute multiplier" as the reason for a narrow trigger. The multiplier is real
  but applies to *billable* minutes, and this repo is public — GitHub-hosted runners are free here.
  The reasons that do hold are wall-clock latency and downstream private apps that inherit the
  workflow.
- **Retired the obsolete "update `DEV_MODE_KEY` in `src/constants.ts`" release step.** Both
  `APP_VERSION` and `DEV_MODE_KEY` have been derived from `package.json` since 0.10.0, and
  `bump-version.sh` says in its own comments that it skips `constants.ts` deliberately — so
  following the instruction literally either did nothing or reintroduced exactly the desync the
  derivation exists to prevent. It survived in five places: `.claude/CLAUDE.md`'s release step 4,
  `.claude/agents/release-manager.md` (both its step 5 and its frontmatter description — the agent
  that actually executes releases, so leaving it stale would have repeated the mistake every time),
  `AGENTS.md`'s file map, and `parallel-release/SKILL.md`. Removing the step renumbered the
  `CLAUDE.md` and `release-manager.md` sequences, and their internal cross-references moved with
  them. `scripts/init.sh` carried the same staleness as two dead `sed` calls targeting
  `APP_VERSION = "x.y.z"` and `dev_mode_x.y.z` literals that no longer exist; both matched nothing
  and exited 0. Removed.

### Verified
- **Both Maestro flows pass unmodified** — 2/2 in 47s on Xcode 26.6 / iPhone 17 simulator /
  Maestro 2.8.0, driven through a throwaway app bootstrapped from this template. Every step in
  `commands.json` reports COMPLETED, so no `tapOn` silently no-op'd. The flow files and their
  whole-label regex selectors needed no changes; only the surrounding tooling and docs did — the
  flows had never actually been executed anywhere before this, in CI or locally.

### Changed
- **Simplified the Claude Code tooling layer.** `.claude/SKILLS.md` is now the single source of
  truth for agent model/effort and skill-loading rules — `.claude/CLAUDE.md`'s agent table no
  longer duplicates model/effort data, and its "UI/UX design rules" no longer contradicts
  `SKILLS.md` by mandating `frontend_design`/`ui-ux-pro-max` unconditionally. Added explicit
  pick-order guidance in `SKILLS.md` for the three overlapping RN-performance skills
  (`rn-react-native`, `rn-react-best-practices`, `react-native-expert`) and the three overlapping
  UI-design skills (`ui-ux-pro-max`, `frontend_design`, `design-for-ai`). Tightened
  `.claude/settings.json`'s allowlist by removing unconditional `mkdir`/`chmod`/`cp`/`mv` (these
  now prompt for confirmation, matching the documented "neither allow nor deny" behavior).
  Removed a stale cross-repo scratch file.
- **`scripts/init.sh` now resets `STATUS.md` and `ROADMAP.md` at bootstrap.** Both are ordinary
  `*.md` files, so the placeholder pass only swapped the app name inside them — every generated app
  inherited the *template's own* status and roadmap, down to its PR numbers and open issues. They
  are now overwritten with genuine starters (version 0.1.0, stage "New app", the generic four-phase
  scaffold). The starter bodies use a quoted heredoc on purpose: they contain backticks, which an
  unquoted one would execute, and no placeholder token may appear in them because `init.sh` is
  itself a `*.sh` caught by its own `--include` filter and would rewrite the heredoc mid-run. The
  app name is echoed separately from the variable. Execution was never at risk — `sed -i` renames,
  so the running shell keeps reading the original unlinked inode.
- **`ROADMAP.md` now tracks the template's own work** instead of sitting as an all-unchecked
  placeholder, so `/standup` reports real per-phase progress rather than ~0% for a repo where most
  of the starter kit is finished. Four phases: template foundation, test/CI hardening, release and
  store automation, monetization and growth.

---

## [0.10.0] — 2026-08-03

### Fixed
- **Wiring a backend left 6–7 Jest suites red (#100).** `npm test` passed in the template
  (25 suites) and in CI, but `scripts/add-backend.sh` closes by telling the developer to run
  `npm run type-check && npm run lint && npm test` — and that last command failed on both
  backends. Four load-time causes, each masking the next:
  1. **Untransformed ESM.** `firebase/app` ships ESM and nothing added `firebase`/`@firebase`
     to `transformIgnorePatterns`, so every suite whose import graph reaches
     `src/services/auth/index.ts` aborted with "Cannot use import statement outside a module".
     Fixed by splicing into jest-expo's negative-lookahead allowlist — appending a pattern
     cannot work, since the option is an OR of things to *ignore*. Needed a second fix
     underneath: the preset transforms `\.[jt]sx?$`, which excludes the genuine `.mjs` file
     `@firebase/util` resolves to.
  2. **Unmocked native SQLite.** `add-backend.sh supabase` installs `expo-sqlite`, whose
     `localStorage/install` side effect runs at import and hit
     `_ExpoSQLite.default.NativeDatabase is not a constructor`. Mocked `virtual: true`, since
     the package is absent from the template as shipped.
  3. **`env.js` validating on require.** `app-config.test.ts` replaced `process.env` wholesale
     with two keys, which is a valid environment only while `BACKEND` is `"none"`, and
     `env-schema.test.ts` still had one case hardcoded to Supabase-only variables that asserts
     `not.toThrow()` on an environment Firebase correctly rejects.
  4. **Partial `src/env.ts` mocks.** Three suites replaced the module with two or three keys,
     dropping `requireEnv` — which a wired adapter calls at module load. Only visible once (1)
     was fixed.
  Verified green in all five configurations: un-wired, Supabase, Firebase, and both
  backends plus `add-social-auth.sh`.
- **`template-backend-smoke-test.yml` now runs `npm test`** in each of its four jobs. It ran
  only `tsc` and `lint`, and neither loads a module the way Jest does — which is the whole
  reason #100 shipped green. Jest config and the shared test fixtures are now in the
  workflow's path filter too.

### Changed
- **Persisted storage is validated with zod schemas (#52).** `loadJson` takes an optional third
  argument — `loadJson(key, fallback, schema)` — and returns the fallback when `safeParse` fails,
  so a shape mismatch can no longer reach a caller disguised as the type it was cast to. The
  two-argument form is unchanged, so no existing call site breaks. Schemas live in the new
  `src/types/schemas.ts` and are now the source of truth: `Theme`, `NotificationPrefs`, `User`
  and `SubscriptionTier` are derived from them with `z.infer`, and `AuthSession` from
  `authSessionSchema` in `src/services/auth/types.ts`. That retires three different hand-rolled
  guard styles — the nested `typeof` chain in `isValidSession`, the four per-field checks in
  `useAppStore`, and the `validTiers`/`validThemes` allow-lists with their casts. `isValidSession`
  and `isValidUser` remain exported from `src/services/auth/` — they are template surface a
  downstream app may import — but are now one-line `safeParse` calls over the same schema rather
  than a second implementation that could drift.

  Two knock-on tightenings worth knowing about: reminder times are now checked against `HH:MM`
  at the storage boundary instead of only inside `parseTime` (a malformed time resets to its
  default at hydration, and zero-padding is required, so `"9:00"` no longer round-trips), and
  `z.object` strips keys the schema doesn't declare, so stale fields from an older app version
  are dropped rather than passed through. Notification prefs keep their per-field fallback — one
  bad field does not reset the other three — via `.catch()` on each field, and a malformed
  `user.name` is dropped rather than invalidating the whole session.

### Added
- **Maestro flow covering persistence across a force-quit — `.maestro/persistence.yaml` (#52).**
  Jest covers the schemas against fixtures; what it can't cover is the real round trip — a value
  written by the running app, through AsyncStorage on a device, read back by `hydrate()` on a
  genuine cold start. The flow onboards, seeds a session, sets a non-default theme, then
  `stopApp` + a bare `launchApp` (`clearState` defaults to false, so the second launch hydrates
  from what the first one wrote) and asserts the app skips both onboarding and the auth wall and
  still has the theme. `Toggle` gained an optional `testID`, forwarded to its `Switch` and used
  by the theme rows in Settings — the label is a plain `Text` and isn't pressable, so without it
  a `tapOn` has nothing to match. `maestro-e2e.yml` now runs the `.maestro/` directory rather
  than naming one file, so a flow added later needs no workflow change.

### Fixed
- **Two persisted `null` blobs crashed hydration (#52).** `useAppStore.hydrate()` and
  `usePaywallStore.hydrate()` both read a field straight off whatever `loadJson` returned, so a
  literal `null` at `<prefix>notification_prefs` or `<prefix>subscription` threw a `TypeError`
  instead of falling back. In the paywall store the throw escaped `hydrate()`, which left
  `isLoading` stuck at `true` — a spinner the user could never get past. Schema validation makes
  the container shape part of the check, so both now fall back cleanly. Regression tests cover
  each.
- **`profiles` was unreadable by the app — missing table grants in `schema.sql` (found by #68).**
  The new backend verification caught this on its first run. RLS *narrows* access that a
  `grant` has already allowed; it never creates it. A table created by running SQL (the SQL
  Editor, or `supabase db push`) leaves `anon`, `authenticated` and `service_role` holding only
  `REFERENCES/TRIGGER/TRUNCATE` — no `select`, `insert`, `update` or `delete`. Every RLS policy
  in the file was therefore a dead letter, and the first `supabase.from("profiles").select()` in
  a generated app — including the `useProfile()` hook in our own `docs/backends/supabase.md` —
  would have failed with `permission denied for table profiles`, an error that reads like an RLS
  bug and isn't one. `schema.sql` now grants `select, insert, update` to `authenticated` and
  `all` to `service_role`, and the verification asserts an authenticated user can actually read
  their own profile so the policies are exercised rather than assumed. Nothing is granted to
  `anon` (every policy is `to authenticated`) and `delete` is withheld from `authenticated`
  (profiles go via the `on delete cascade`). Tables made with the dashboard's Table Editor get
  these grants applied automatically, which is why the gap only bit the SQL path.

### Added
- **Sign in with Google for both backends (#70).** The login screen has rendered a Google
  button since the social module landed; it reported "not configured" because no adapter
  implemented it. Now `bash scripts/add-social-auth.sh` installs Apple **and** Google
  together — deliberately, since **App Store guideline 4.8** makes Apple mandatory the
  moment any other third-party login is offered. The two backends need genuinely different
  implementations and share almost nothing. **Supabase** uses `signInWithOAuth` +
  `expo-web-browser`, with Google's client ID and secret staying in the Supabase dashboard,
  so nothing enters the app and it works on iOS and Android alike. **Firebase (JS SDK)**
  cannot use `signInWithPopup` / `signInWithRedirect` at all — both need a `window`, which
  React Native does not have, and that is what every Firebase tutorial reaches for. It
  instead runs `expo-auth-session` code+PKCE (Google refuses implicit `id_token` for
  installed apps) via the imperative `AuthRequest` API, because
  `expo-auth-session/providers/google` is a React hook and `social.ts` is a plain module.
  Firebase + Google is **iOS-only**: Android needs its own OAuth client keyed to a signing
  SHA-1, so the module throws `not_wired` with an explanation rather than producing an
  opaque `redirect_uri_mismatch`. Brings `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (Firebase path
  only, optional — social sign-in is opt-in, so it is enforced at the point of use).
- **`flowType: "pkce"` on the Supabase client (#70).** It previously set none, so supabase-js
  defaulted to the *implicit* flow: no code verifier is stored, and `exchangeCodeForSession()`
  fails with "code verifier should be non-empty". PKCE is also the only one of the two that is
  safe on a device, since implicit puts the access token in a URL. The social module reads
  **both** callback shapes, so an app wired before this change keeps working without editing
  an adapter the install script promises never to touch. Sign in with Apple is unaffected —
  native sheet, no browser round-trip.
- **`parseOAuthCallback()` and `googleReversedClientId()` in `src/services/auth/oauthCallback.ts`,
  with unit tests (#70).** Callback parsing is the likeliest part of an OAuth flow to be
  subtly wrong — query vs fragment, PKCE vs implicit, an error where a token was expected —
  and it fails as a browser that closes with nothing happening, which is indistinguishable
  from a dead button. Social modules are copied out of `templates/`, which this repo's CI
  cannot import, type-check, or lint, so both helpers live where the test run can see them,
  next to `appleNameToPersist` and for the same reason. Covered: `?code=`, `#access_token=`
  with and without a refresh token, `error_description` in query *and* fragment, Google's
  `access_denied` mapped to `cancelled` so the store swallows it, malformed percent escapes,
  and a callback carrying nothing at all. Deriving the reversed client ID rather than taking
  a second env var means `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and the `app.json` URL scheme
  cannot drift apart silently.
- **CI verification of the Supabase account-deletion contract (#68).**
  `.github/workflows/verify-backend.yml` starts a throwaway local Supabase, applies
  `templates/backends/supabase/schema.sql` (twice, since the file claims to be idempotent) and
  runs `scripts/verify-backend-contract.mjs` against a real Postgres + GoTrue. It asserts the
  auth user is genuinely gone after `delete_own_account()` — checked with the `service_role`
  key rather than by trusting the RPC's own return value — that the `on delete cascade` really
  removed the profile, and that `anon` is blocked by the missing grant rather than by the
  function's own `Not authenticated` raise (without that distinction the test would pass even
  if the `revoke` were dropped). The assertion that earns the workflow is the last one: CI
  **drops the RPC and calls it again**, requiring the client to see an error. A deletion that
  silently no-ops is indistinguishable from a successful one, which is exactly what Google
  Play's Data safety requirement exists to catch, and until now `deleteAccount()` was only ever
  tested against a stub. Runs on PRs touching `templates/backends/**` and weekly to catch drift
  in Supabase itself; no-ops when no Supabase backend is wired.
- **Typed Supabase database (#64).** `src/types/database.types.ts` is generated from
  `schema.sql` and committed, and the adapter now calls `createClient<Database>(...)`, so
  `.from("profiles").select()` returns typed rows instead of `any` and a renamed column is a
  build error rather than `undefined` at runtime. The same workflow regenerates the file and
  fails the PR when it has drifted. Generated with `--local` rather than the `--linked` form
  first proposed: it needs no project ref and no `SUPABASE_ACCESS_TOKEN` in CI, and it covers
  this template, which has no linked project. The trade-off is that **`schema.sql` is the
  source of truth** — a change made only in the dashboard is caught when someone writes it back
  to the file, not before. Documented in `docs/backends/supabase.md`.
- **Cold-start persistence and background token refresh added to the Data safety checklist**
  in `.claude/reference/store-submission.md`, with the reason each stays manual: they exercise
  the `expo-sqlite/localStorage` session store and the module-scope `AppState` listener, neither
  of which exists headlessly. A green headless check would prove the Supabase API works, not
  that our wiring does — and would stop people running the test that actually proves it.
- **Sign in with Apple for the Firebase backend (#62).** Only the Supabase half of the recipe
  had shipped, so a Firebase app had no supported route to Apple sign-in — and **App Store
  guideline 4.8** makes it mandatory the moment the app offers any other third-party login,
  so adding Google later was a rejection waiting to happen. `bash scripts/add-social-auth.sh`
  now takes no argument and detects the backend from whichever adapter is in
  `src/services/auth/`, installing `templates/social/firebase-social.ts` plus `expo-crypto`
  on the Firebase path. The Firebase credential needs a **nonce**, and the two sides get
  different values derived from the same secret — Apple's sheet gets `SHA-256(raw)` as
  lowercase hex, Firebase gets the raw nonce and hashes it itself. Reverse them and you get
  `auth/invalid-credential` with nothing pointing at the cause, so both the module and
  `docs/backends/firebase.md` spell the pairing out. Name capture reuses the already-tested
  `appleNameToPersist`; Firebase does not populate `displayName` from an Apple credential on
  its own, and Apple sends the name only on the first authorization ever. Note this costs the
  Firebase JS SDK path its Expo Go support — the *Pick a path first* table now says so.
- **Dev sign-in bypass button on the login screen (#39).** Once a backend is wired, every screen
  sits behind auth and you retype credentials on every reload. Setting
  `EXPO_PUBLIC_DEV_BYPASS_EMAIL` / `EXPO_PUBLIC_DEV_BYPASS_PASSWORD` adds a "Skip Sign-In (Dev)"
  button that signs in through the **real** `signIn()` → `AuthProvider` path, so the app gets a
  genuine session and JWT — a faked `isAuthenticated` flag would get past the redirect in
  `app/index.tsx` and then fail silently on every RLS-protected query. It is the complement of
  `DevSeedSessionButton`: that one only renders with no backend wired, this one only with one, so
  exactly one of the two can ever appear. Gated on `isDevBuild`, as the first statement in the
  component, per `.claude/CLAUDE.md`.
- **`app.config.js` strips `EXPO_PUBLIC_DEV_BYPASS_*` from store-bound builds.** `isDevBuild` hides
  the button, not the password — `EXPO_PUBLIC_*` values are inlined into the JS bundle, so a
  credential left in a production EAS environment group would ship regardless of what renders. The
  pair is now dropped from `extra.env` (with a build-time warning) on `main`, `release/*`, and any
  build whose branch can't be resolved, failing closed the same way `isDevBuild` does. For the same
  reason the two keys are deliberately absent from `readEnv()`'s `process.env` fallback in
  `src/env.ts`: Babel would inline them there and defeat the strip.

### Fixed
- **A network failure during session hydration silently signed users out.** `useAuthStore.hydrate()`
  caught every error from `getSession()` the same way, so a device with no connectivity looked
  identical to an actually-invalid session — a user with a perfectly valid stored session got bounced
  to the login screen on a flaky connection. `hydrate()` now branches on `AuthError.code === "network"`:
  the existing session state is left untouched and a new `hydrationError` flag is set instead, which
  `app/_layout.tsx` routes to a new `app/network-error.tsx` "No Connection" retry screen rather than
  the login screen. Non-network hydration failures (corrupt keychain, malformed persisted session)
  keep the previous signed-out fallback. `hydrationError` is cleared by every transition to a
  known auth state (it lives in the store's `signedOut` constant and `applySession()`), so a
  background token refresh landing while the user waits on the retry screen releases them
  instead of pinning them there with a valid session. `AuthProvider.getSession()` documents the
  contract this depends on: answer from persisted state first, and throw `AuthError("network")`
  only when validating or refreshing a session that exists. (#63)
- **`maestro-e2e.yml` had no working automatic trigger — it has never run in CI.** Its only
  non-manual trigger was `release: [published]`, which can never fire: `release.yml` publishes that
  Release with the default `GITHUB_TOKEN`, and GitHub's recursion guard suppresses workflow-triggering
  events raised by that token. Confirmed on 0.9.0 — `release.yml` green, `v0.9.0` tagged and
  published, and `gh run list --workflow maestro-e2e.yml` returned no runs at all. This is the same
  trap `android-release.yml` hit with `push: tags:` (#95). Fixed the same way: `maestro-e2e.yml` now
  exposes `workflow_call` (the dead `release:` trigger is gone, `workflow_dispatch` stays), and
  `release.yml` calls it as a dependent job gated on the existing `tag_created` output, so a re-run
  on an already-tagged `main` doesn't spend another 15-25 minutes of `macos-latest`. No PAT and no
  new secret — and no `secrets: inherit` on this one, since nothing in the workflow reads a secret.
  Runs in parallel with `android-release`, so it adds no wall-clock time to the Android path.
- **Maestro debug artifacts are now uploaded when the E2E job fails.** `~/.maestro/tests` (view
  hierarchies and screenshots) plus Metro's log are bundled as a `maestro-debug-output` artifact.
  Those hierarchies identified four of the six flow defects fixed in #92, and none of those fixes has
  ever executed in CI because of the trigger bug above — so the first genuine run, on a downstream
  bootstrapped app, is the one most likely to fail on something a local run can't reproduce
  (simulator selection, cold-runner Metro timing).
- **Release gate's Device E2E row now says "Runs after merge to main"** instead of "Not run for this
  release". The row stays ⚠️ on every release PR by design — a reusable workflow invoked via `uses:`
  produces jobs inside the caller's run, never a `maestro-e2e.yml` run of its own for
  `listWorkflowRuns` to resolve against the PR's head SHA — but the old wording implied the E2E was
  skipped entirely, which is no longer true.

---

## [0.9.0] — 2026-08-01

### Fixed
- **The Maestro E2E flow could never have passed — validated it against a real simulator and
  fixed six defects.** `.maestro/full-journey.yaml` and `.github/workflows/maestro-e2e.yml` (#80)
  shipped without ever executing anywhere; the workflow only fires on `workflow_dispatch` or
  `release: published`, and manual dispatch needs the file on the default branch, so nothing had
  exercised them. Running the flow locally against a bootstrapped app on an iOS Simulator
  (Maestro 2.8.0) surfaced:
  1. **The flow did not parse.** `assertVisible` takes no `timeout` property in Maestro 2.8.0 —
     the run aborted with `Unknown Property: timeout` before executing a single step. Waiting with
     a deadline is `extendedWaitUntil` (`visible:` + `timeout:`).
  2. **Selectors are whole-label regexes, not substrings** — the opposite of what the flow's own
     header comment asserted. `"Welcome to"` cannot match "Welcome to MyApp"; it needs
     `"Welcome to.*"`. The comment is corrected in place, since it was the source of the error.
  3. **iOS decorates accessibility labels.** A tab bar item is `"Settings, tab, 2 of 2"` and a
     settings row is `"Delete Account, ›"` (trailing chevron), so neither bare title matched.
  4. **The account-deletion row is below the fold**, and an off-screen row is still in the
     accessibility tree — so `tapOn` reported COMPLETED while tapping nothing, and the two-step
     deletion silently never started. Now scrolled into view with `scrollUntilVisible` first.
  5. **The paywall deep link raises a native "Open in <App>?" confirmation** that the flow never
     dismissed, so it never reached the paywall. Handled with a conditional `runFlow`, since the
     prompt does not appear when the link is opened from inside the app.
  6. **CI would have run the app with no JS bundle.** GitHub Actions sets `CI=1`, under which
     `npx expo run:ios` exits once the app launches and takes Metro with it; a Debug build embeds
     no bundle, so the app came up on a red "No script URL provided" screen. `maestro-e2e.yml`
     now starts Metro as its own background process and waits for `packager-status:running`
     before building, failing fast with the Metro log if it never comes up.

  The flow now completes all 21 steps green, twice consecutively — including the two-step
  account-deletion confirmation and the `Stack.Protected` redirect back to the sign-in screen once
  `isAuthenticated` flips false.

### Added
- **Screen tests for the `Stack.Protected` auth guards (#65).** New
  [src/__tests__/screens/auth-guards.test.tsx](src/__tests__/screens/auth-guards.test.tsx) covers
  all four guard combinations in [app/_layout.tsx](app/_layout.tsx) — signed out, signed in,
  onboarding-incomplete (asserted against *both* auth states, so it proves onboarding takes
  precedence rather than merely coinciding with the signed-out case), and hydration still in
  flight — plus the #58 regression: when auth flips false mid-session, `Stack.Protected` removes
  the `(tabs)` screens from the navigator's state rather than just navigating away from them, so
  no history entry survives to back-swipe into. Built on the #77 harness; it registers the real
  `_layout.tsx` and real nested paths with `renderRouter` rather than the single-screen
  `{ index: Component }` shortcut, and controls hydration's *inputs* (the provider's
  `getSession()` and the onboarding AsyncStorage key) because the layout's mount effect
  re-hydrates every store and would overwrite state seeded with `setState`. `app/_layout.tsx`
  itself is unchanged — the guard logic was already correct.
- **Release gate now reports all four post-#74 checks in one PR comment.**
  `.github/workflows/release-review.yml`'s summary comment previously only covered
  type-check/lint/test/version/CHANGELOG. It now adds rows for the bootstrap smoke test (#75,
  `template-smoke-test.yml`) and backend-wiring smoke test (#76, `template-backend-smoke-test.yml`)
  by querying `listWorkflowRuns` for the PR's head SHA — rendering ✅/❌/⏳ only when a run for
  that exact commit actually exists, otherwise "Not run for this change" — plus a hardcoded
  Screen tests row (#78, already covered by the job's own `npm test` step) and a Device E2E
  (Maestro) row (#80) that reads "Not run for this release" on every normal release PR by design,
  since `maestro-e2e.yml` only fires on `workflow_dispatch` or `release: published`, never
  per-PR. No new workflow file — extends the existing gate only.
- **Maestro E2E flow: launch through account deletion.** New
  [.maestro/full-journey.yaml](.maestro/full-journey.yaml) drives a real iOS Simulator build
  through the full journey — onboarding swipe-through, the #79 dev-seed-session seam past the
  auth wall, the paywall (reached via its deep link, since nothing in the template links to it
  yet), the settings tab, and the two-step account-deletion confirmation — asserting the app
  lands back on the sign-in screen once `isAuthenticated` flips false. New
  `.github/workflows/maestro-e2e.yml` runs it on `macos-latest` via `expo run:ios`, triggered
  only by `workflow_dispatch` and `release: published` — never per-PR, since a macOS runner
  bills at a 10x minute multiplier and `expo run:ios`'s prebuild + native compile takes
  ~15-25 minutes. Skips cleanly (same pattern as `eas-preview.yml`) when `app.json` still has
  template placeholders. The Maestro CLI installs via its own shell installer (not an npm
  package) with `MAESTRO_VERSION` pinned rather than "latest" — the installer performs no
  checksum verification, so an unpinned version would let a compromised or changed
  `get.maestro.mobile.dev` response silently alter what CI executes; see the new "CI / build
  tooling" table in [VERSIONS.md](VERSIONS.md). The install step fails closed (`set -euo
  pipefail` + `curl -f`, so an HTTP error page is never piped into `bash`) and asserts
  `maestro --version` reports the pinned version, so an installer that stopped honouring
  `MAESTRO_VERSION` would break the build rather than silently run "latest". Evaluated Maestro Cloud as an alternative
  runner for the test-execution step and rejected it: at this cadence (2-4 runs/month) the
  `macos-latest` approach costs ~$0 (well within GitHub's free monthly macOS-runner minutes),
  versus Maestro Cloud's $250/month flat subscription — which also doesn't eliminate the
  macOS build requirement, since Maestro Cloud doesn't build the app itself.
- **`test-engineer` subagent** ([.claude/agents/test-engineer.md](.claude/agents/test-engineer.md)) —
  owns `src/__tests__/**` and is the only agent that writes test files. Nothing previously owned
  testing: no agent's workflow ran `npm test`, and `ios-frontend` verified with `type-check` alone.
  Reads [docs/testing.md](docs/testing.md) rather than loading a skill. Hard rule: never weaken an
  assertion to make a test pass — report the bug instead.
- **`model` and `effort` declared per agent.** Every agent was previously `model: sonnet` with no
  `effort` set, so a mechanical release-branch script and a security review got identical
  reasoning budget. Now tiered by cost-of-a-mistake: `qa-reviewer` and `devops-agent` on opus,
  `aso-marketing` on haiku, the rest on sonnet, with effort from `low` to `high`. Matrix in
  [.claude/SKILLS.md](.claude/SKILLS.md).
- **`isDevBuild` — a build-time gate for dev-only affordances.** New export in
  [src/env.ts](src/env.ts): true in a dev client, and in any build cut from a branch that is not
  store-bound (`main` or `release/*`). `gitBranch` is baked into the Expo manifest by a new
  `resolveGitBranch()` in [app.config.js](app.config.js) (`GITHUB_REF_NAME` → `CI_BRANCH` →
  `git rev-parse`). This did not previously exist despite being referenced as existing —
  `__DEV__` alone would delete dev affordances from production-profile builds off feature
  branches, which `.claude/CLAUDE.md` explicitly requires them to survive. `release/*` counts as
  production because Xcode Cloud sets `CI_BRANCH` from a real checkout, so archiving off a
  release branch would otherwise ship dev affordances to TestFlight. An unresolvable branch
  resolves to `null` and also counts as production: fail closed. Note that a *remote* EAS build
  has neither CI variable and no `.git`, so dev affordances are absent there — use a
  development-profile build or `eas build --local`.
- **Dev-only seed-session button on the sign-in screen.** With the shipped default
  `BACKEND="none"`, `localAuthProvider.signIn()` and `signUp()` both throw `not_wired`
  deliberately, so the app could not be walked end to end and a UI driver like Maestro had no
  tappable path past the auth wall. `seedLocalSession()` existed as the escape hatch but only a
  Jest test could reach it. New `src/components/dev/DevSeedSessionButton.tsx` calls it with a
  fixed fake session, then re-hydrates through the real `authProvider.getSession()` path so
  `Stack.Protected` moves to `(tabs)` on its own. Gated on `isDevBuild && backend === "none"` —
  unreachable in a store build, and hidden once a real provider is wired, since seeding writes a
  key that provider never reads.
- **React Native screen-test harness.** `@testing-library/react-native` was installed but
  had zero usages — nothing in the repo could render a component. Adds `setupFilesAfterEnv`,
  native-module mocks in `jest.setup.js` for the dependencies every screen pulls in
  transitively (`react-native-safe-area-context`, which wraps all of them via `Screen.tsx`,
  plus `expo-haptics`, `expo-notifications`, `posthog-react-native`, `expo-store-review`),
  and one documented reference test at `src/__tests__/screens/home-screen.test.tsx` that
  renders `app/(tabs)/index.tsx` through `expo-router`'s `renderRouter`. All seven screens
  in `app/` were verified to render against it with no further mocking. New
  [docs/testing.md](docs/testing.md) documents the copyable pattern, what `jest-expo`
  already provides (the `@/` alias and `transformIgnorePatterns` — do not re-add them), and
  two traps: screen tests cannot live under `app/` because Expo Router would turn them into
  routes, and `renderRouter` enables fake timers without restoring them. Also adds
  `types/expo-router-testing-library.d.ts`, since Expo Router registers matchers like
  `toHavePathname` at runtime but ships an empty `expect.d.ts`, so they would otherwise
  pass `npm test` and fail `npm run type-check`.
- **Screen render tests for every remaining production screen.** Onboarding, sign up,
  forgot password, paywall, and settings now each have a `src/__tests__/screens/*.tsx` test
  following the harness pattern above; `login.tsx` already had render coverage from its
  dev-seed-gate test. `settings-screen.test.tsx` also proves the two-step delete-account
  confirmation in `app/(tabs)/settings.tsx` can't be short-circuited by a single confirm —
  `Alert.alert` is spied, its button config captured, and callbacks invoked manually to walk
  both alerts, since a native alert renders nothing queryable. The auth provider is mocked
  with the same stable-object convention as `useAuthStore.test.ts`; note the screen there is
  `require`d after `jest.mock` runs, not statically imported, because a static import gets
  hoisted above the mock's backing `const` and would read it as `undefined`.
- **CI smoke test for `scripts/init.sh`.** New `template-smoke-test.yml` workflow runs
  `init.sh` with fixed dummy flags on its own ephemeral checkout, then asserts no
  `[APP_*]` placeholders remain and that `app.json` / `package.json` match the injected
  values — `init.sh`'s own verification block never exits non-zero, so this catches a
  broken substitution that it would silently miss. Runs `tsc`, lint, tests, and
  `expo-doctor` against the bootstrapped result. Triggers on `release: published`, PRs
  touching `scripts/init.sh` / `IDEA.md` / `app.json` / `package.json`, and manual
  dispatch.
- **CI smoke test for `scripts/add-backend.sh` and `scripts/add-social-auth.sh`.** New
  `template-backend-smoke-test.yml` workflow runs three independent jobs on fresh
  checkouts — Supabase, Supabase + Sign in with Apple, and Firebase — and asserts the
  adapter file, `src/services/auth/index.ts` activation, `env.js`'s `BACKEND` constant,
  and the uncommented `.env.example` lines all landed correctly, then runs `expo-doctor`,
  `tsc`, and lint against the wired-up tree. Each job sets its own job-level placeholder
  `env:` block, since `add-backend.sh` rewrites `BACKEND` in `env.js` and every
  subsequent Expo-touching step needs matching vars or `env.js` throws. Triggers on PRs
  touching the backend/social scripts or templates, and manual dispatch.

### Changed
- **Skills load conditionally instead of on every run.** `ios-frontend` loaded 7 skills before
  writing a line and `qa-reviewer` loaded 6 before reading the diff, so a spacing fix cost the same
  context as a new screen. Each agent now routes on task shape — a trivial `ios-frontend` brief
  loads none, and `qa-reviewer` pulls the Trail of Bits stack only when the diff earns it.
- **`.claude/CLAUDE.md` trimmed from 605 to ~430 lines.** It is injected into the orchestrator *and*
  every subagent spawn, so its length is paid on every delegation. Xcode Cloud, Obsidian
  conventions, issue-label tables, and the store-submission checklists moved to
  `.claude/reference/*.md` behind one-line pointers; the ASO section was deleted as a duplicate of
  the [`aso-rules`](.claude/skills/aso-rules/SKILL.md) skill. No guidance was lost.
- **Long-report handoff threshold lowered from ~80 to ~50 lines**, so subagent reports round-trip
  through `.claude/scratch/` rather than through orchestrator context.
- `aso-marketing` no longer requests the `WebFetch` tool — its workflow never fetched a URL.

### Fixed
- 

### Removed
- 

---

## [0.8.0] — 2026-07-30

### Added
- **Sign in with Apple (Supabase).** `bash scripts/add-social-auth.sh` — run after
  `add-backend.sh` — installs `expo-apple-authentication`, drops `social.ts` beside the
  adapter, and composes it onto the port (`{ ...supabaseAuthProvider, ...socialAuth }`), so
  the ~190-line adapter is never rewritten by a script. Uses the native sheet and
  `signInWithIdToken`; no browser, no redirect URI. The module captures the user's name on
  the first authorization, which is the only time Apple ever sends it. The script prints the
  `app.json` plugin and `usesAppleSignIn` steps and never edits it. **Adding this means the
  app no longer runs in Expo Go and the EAS build cache is invalidated** — both surfaced, not
  silent. Mandatory under App Store guideline 4.8 once any other third-party login is offered.
  Google is tracked separately; Firebase's Apple path is still to come.

- Branded `SocialSignInButton` for Apple and Google, drawn with the already-present
  `react-native-svg` — no new dependency. Provider appearance rules are binding and get
  checked at review, so it follows Apple's HIG and Google's Identity guidelines rather than
  the app's design tokens. The Google variant ships styled but still reports "not configured"
  until Google sign-in lands.

- Per-app privacy-policy generator. `scripts/gen-privacy-policy.mjs` renders a complete,
  standalone-styled `privacy-<app-slug>.html` from `store-listing/privacy.config.json` +
  `src/constants.ts`, failing on unfilled placeholders, a missing `#delete` anchor, or a
  `PRIVACY_POLICY_URL` that doesn't match the slug. Ships with `store-listing/privacy-shell.html`
  (self-contained styling matching `privacy-policy-template.html` and the published pages),
  `privacy.config.example.json`, and `store-listing/PRIVACY.md`. New
  `.github/workflows/verify-privacy.yml` regenerates the page and checks the live URL resolves
  (200) with the `#delete` anchor — no-ops in the un-bootstrapped template. Convention: one
  privacy page **per app**, never a shared policy.

- **TanStack Query data layer.** `QueryClientProvider` in `app/_layout.tsx`, a shared client
  in `src/lib/queryClient.ts`, and an `AppState` bridge into React Query's `focusManager` —
  without it `refetchOnWindowFocus` silently does nothing on native, since there is no
  browser window to focus. Mutations default to `retry: 0` because retrying a non-idempotent
  POST can double-charge. **The cache is cleared on sign-out and account deletion**;
  otherwise the previous user's data is served to whoever signs in next on the same device,
  which renders before any refetch resolves and is a data leak on a shared device. It is
  deliberately *not* cleared when a delete fails — the user is still signed in and still
  looking at their data. Both backend guides show the matching query-hook pattern.
- **One-command backend setup.** `bash scripts/add-backend.sh <supabase|firebase>` installs
  the provider's packages, copies its `AuthProvider` adapter into `src/services/auth/`,
  activates it, promotes its env vars to required in `env.js`, uncomments them in
  `.env.example`, and prints the manual steps it can't do safely. It refuses to clobber an
  existing adapter or wire two providers at once without `--force`, and it never edits
  `app.json` — a config plugin is always surfaced, never silent.
  - **Supabase** ships a `schema.sql` with a `profiles` table, RLS policies written the fast
    way (`(select auth.uid())` + `to authenticated` + an index), a signup trigger, and the
    `delete_own_account()` SECURITY DEFINER function that account deletion depends on.
  - **Firebase** installs the JS SDK path: no config plugin, no native modules, runs in
    Expo Go, EAS cache untouched. The guide covers migrating to React Native Firebase when
    Analytics/Crashlytics/FCM are needed, including the `forceStaticLinking` requirement
    that is mandatory on this template's SDK 56 / RN 0.85.
  - Adapter sources live in `templates/backends/`, excluded from `tsconfig` and ESLint
    since they import SDKs the template deliberately does not install.
- **Backend guides** at `docs/backends/supabase.md` and `docs/backends/firebase.md` —
  setup, the React Native specifics every upstream quickstart omits, account-deletion
  verification, and known gotchas.
- **Build-time environment validation.** `env.js` defines a Zod schema that `app.config.js`
  runs on every `expo start`, `expo prebuild`, and EAS build, so a missing or malformed
  variable fails the build with a readable message naming every offender — instead of
  surfacing as `undefined` three screens deep on a user's device. It also rejects the common
  half-configured case (a Supabase URL with no publishable key, or the reverse) and promotes
  a provider's variables from optional to required once a backend is selected. Validated
  values are published to the Expo manifest and read back through the new typed `src/env.ts`
  (`env`, `requireEnv`, `backend`); `process.env` reads in app code are replaced. Adds `zod`.
- **Provider-agnostic auth port** (`src/services/auth/`). `AuthProvider` defines what any
  backend must supply — `getSession`, `signIn`, `signUp`, `signOut`, `resetPassword`,
  `deleteAccount`, `subscribe`, plus optional `signInWithApple` / `signInWithGoogle`.
  Adding Supabase or Firebase means writing one adapter and changing one export line;
  `useAuthStore` and every `(auth)` screen stay untouched. The template still installs no
  backend dependency — the shipped `local` provider persists a session across launches and
  throws `not_wired` for anything needing a server.
- `useAuthStore` now carries a real session model (`accessToken` / `refreshToken` /
  `expiresAt` / `user`) instead of a bare `{id, email, name}` blob, and owns `signIn`,
  `signUp`, `resetPassword`, and the social entry points that previously lived as TODOs
  inside screens. A persisted session from the old scaffold is migrated on first launch.
- `useAuthStore.init()` subscribes to out-of-band session changes — background token
  refresh, expiry, or a sign-out on another device — and returns its unsubscribe, which
  `app/_layout.tsx` uses as effect cleanup.
- `AuthError` carries a typed `code`, and `authErrorMessage()` maps it to a safe
  user-facing string, so provider-internal database and JWT text never reaches the UI.

### Fixed
- 🔴 **The test suite went red the moment you wired a backend.** Running
  `scripts/add-backend.sh supabase` left a generated app with two failing suites, so the
  first thing anyone saw after connecting a backend was a broken build they hadn't caused.
  `useAuthStore.test.ts` couldn't even load — the barrel now pulls in the Supabase adapter,
  whose `expo-sqlite` import has no native module under Jest — and its assertions were
  written against the local scaffold, so they'd have been false anyway once a real provider
  was active. `env-schema.test.ts` hardcoded the template's `BACKEND = "none"` default.

  Split by what each file actually tests: `useAuthStore.test.ts` now mocks the auth barrel
  and covers store logic against a fake provider, and the scaffold's own behaviour moved to
  `src/services/auth/__tests__/local.test.ts`, which imports `local.ts` directly and so
  stays valid whatever backend is wired. The env tests assert the *rule* — that selecting a
  backend promotes its variables from optional to required — against whichever backend is
  actually selected, which also means the Firebase branch is covered for the first time.
  A generated Supabase app now runs the full suite green.

- 🔴 **Signup granted full app access without a backend.** `app/(auth)/signup.tsx` called
  `setUser({ id: "placeholder", … })` and navigated into the app, so any app built from the
  template that hadn't wired auth yet shipped a working-looking signup that authenticated
  nobody. Signup now goes through the provider and fails loudly until a backend is added.
- 🔴 **`(tabs)` had no auth guard.** Gating was a one-shot `<Redirect>` in `app/index.tsx`,
  so nothing reacted to auth going false mid-session, and screens navigated by hand after
  sign-out. Replaced with `Stack.Protected` guards in `app/_layout.tsx`, which also purge
  history — a back-swipe can no longer return to a signed-in screen after signing out.
- **Dead social sign-in buttons.** "Continue with Apple" and "Continue with Google" were
  wired to `onPress={() => {}}` and shipped in every new app. They now report that the
  provider isn't configured instead of silently doing nothing.
- **`expo-services` skill documented a storage API that does not exist.** It told agents to
  write `storage.setJSON(...)` / `storage.getJSON(...)`, but `src/utils/storage.ts` exports
  named functions (`loadJson`, `saveJson`, `removeItem`, …) and no `storage` object — any
  agent following the skill produced code that failed `tsc` on the first line. Corrected, and
  the `STORAGE_PREFIX` key convention documented alongside it.
- **Contradictory guidance on where an SDK auth listener belongs.** The skill said the store's
  `init()`, `useAuthStore.ts` said `app/_layout.tsx`, and neither `init()` nor a listener
  existed. Settled on one rule — `init()` on the store returns its unsubscribe, `_layout.tsx`
  owns the lifecycle — and applied it everywhere.
- **`backend-integrator` requested `@supabase/ssr`** in its canonical `PACKAGES_NEEDED`
  example. That is a Next.js server package with no use in React Native. Replaced with the
  real RN package set, plus an explicit rule against server-side packages.
- The skill's store contract referenced `init()` / `reset()` actions that no store in the
  repo has. Rewritten to match the actual `hydrate()` / `signOut()` shape.
- `app/(tabs)/settings.tsx`: guard the account-deletion error path against state updates
  after unmount. `performDelete()` now tracks mount state with an `isMountedRef` and skips
  the `Alert` + `setIsDeleting(false)` if the screen unmounted mid-request — matching the
  existing pattern in `app/(auth)/login.tsx`.

### Changed
- **Backend integration guidance now covers what actually breaks in React Native.** The
  Supabase section grew from three bullets to the full set of RN-specific requirements
  (session storage adapter and why not SecureStore, `detectSessionInUrl: false`, the
  module-scope `AppState` refresh listener, URL polyfill, RLS policy performance, and the
  `signOut()`-after-delete failure). Added a **Firebase section**, which did not exist:
  RN Firebase vs JS SDK trade-offs, `getReactNativePersistence`, the `forceStaticLinking`
  requirement on this template's SDK 56 / RN 0.85, and how to get `google-services.json`
  to EAS without committing it. `SETUP.md` Phase 6 and the `useAuthStore` wiring comment
  now carry the same warnings.
- Documented `EXPO_PUBLIC_SUPABASE_*` and `EXPO_PUBLIC_FIREBASE_*` in `.env.example` and
  the README. They previously appeared only inside a `devops-agent` example block.
- Allowlisted `firebase.google.com` and `rnfirebase.io` for `WebFetch`; only `supabase.com`
  was reachable before.
- `AuthErrorCode` gains **`cancelled`**, and the store swallows it — dismissing the Apple
  sheet or an OAuth browser now shows nothing instead of a red error for a tap the user
  deliberately took back. **Breaking** for hand-written adapters that exhaustively switch on
  `AuthErrorCode`. The port also now requires that adapter methods not depend on `this`,
  since social sign-in is composed on by object spread.
- The login screen routes social failures to their own slot instead of the password field's
  error prop, and spins only the button that was pressed rather than all three. Apple's
  button is iOS-only — the recipe uses the native sheet, so elsewhere it could only fail.
- `toAuthSession` / `toAuthError` are now exported from the Supabase adapter template so the
  social module reuses that error-mapping table instead of growing a copy that drifts.

---

## [0.7.0] — 2026-07-23

### Added
- **Account deletion flow** — Settings now has a "Danger Zone" card with a Delete Account row behind a two-step confirmation, plus a `deleteAccount()` method on `useAuthStore`. Required by Google Play "Data safety" and Apple App Privacy once an app supports account creation. The template scaffold clears local state only; each app wires its own backend delete call into it (Supabase example documented in `src/store/useAuthStore.ts`).
- Settings → Support → **Request Data Deletion** — `mailto:` fallback so users who no longer have the app installed can still request deletion, which stores expect regardless of the in-app flow.
- `store-listing/privacy-policy-template.html` — reusable privacy policy page with a `#delete` anchor documenting how to delete an account and what is retained. Copy into the `focalstudio.github.io` Pages repo per app; Play's account-deletion URL points at that anchor.
- **Data safety checklist** in `.claude/CLAUDE.md`, wired into both the Apple and Google Play release checklists, and a corresponding section in the `app-bootstrapper` setup-tracking issue so new apps handle this before their first submission rather than at rejection.
- `.claude/skills/parallel-release/` — authoritative runbook skill for simultaneous iOS (Xcode Cloud) + Android (EAS) releases: recurring release flow, the one-time Android bootstrap a newly created app must complete before CI can succeed (keystore, Play Console app + gates, service account, local proof), automation map, gotchas, and verification. Wired into the `release-manager` agent and indexed in `.claude/SKILLS.md`.
- `app-bootstrapper` agent now seeds the one-time Android release bootstrap (Play Console app, service account, keystore, local `eas build`/`eas submit` proof) into the setup-tracking issue it creates for every new app, plus a Phase 7 next-step pointer — so future apps don't discover the manual Android setup only at first release.
- `ios/ci_scripts/ci_post_xcodebuild.sh` — Xcode Cloud post-build guardrail that fails the build if the archive is missing an embedded `main.jsbundle`, so a bundling regression can never silently reach TestFlight (#37).
- `LICENSE` — proprietary "all rights reserved" license; satisfies GitHub's Community Standards License item and codifies the README's copyright stance
- Unit tests covering `hydrate()` validation and setters for all four Zustand stores (`useAuthStore`, `usePaywallStore`, `useOnboardingStore`, `useAppStore`), plus a `version-consistency` test asserting `src/constants.ts` `APP_VERSION`/`DEV_MODE_KEY` stay in sync with `package.json`

### Fixed
- **Analytics opt-out was silently ignored on every cold start.** `useAppStore.hydrate()` restored the persisted `analyticsEnabled` value into the store but never pushed it into `src/services/analytics.ts`, whose module-level `enabled` flag reset to `true` on each launch — so a user who opted out kept sending events until they manually re-toggled. `hydrate()` and `setAnalyticsEnabled()` now both apply the preference to the service, and `initAnalytics()` re-applies it to the PostHog client so init/hydrate ordering doesn't matter.
- `KEYSTORE.md` / `.claude/CLAUDE.md` / `README.md`: corrected the `android-release.yml` tag trigger from `v*` to the actual `v[0-9]+.[0-9]+.[0-9]+` glob; corrected the Google Play "API access" location (account-level `play.google.com/console/api-access`, not the app nav); documented the first-submit service-account permission gotcha (Admin fallback + propagation wait) and the CI self-bootstrap constraint (`android-release.yml`'s first real run is the first release tag, since `workflow_dispatch` needs the workflow on `main`)
- **Tag→Android trigger never actually fired.** `release.yml` pushed the `vX.Y.Z` tag using the default `GITHUB_TOKEN`, and GitHub's recursion guard never fires other workflows from GITHUB_TOKEN-created events — so `android-release.yml`'s `push: tags:` trigger was dead code and the Android leg silently never ran after a release. `android-release.yml` is now a reusable workflow (`workflow_call` + `workflow_dispatch`, tag trigger removed); `release.yml` calls it directly as a dependent job (`needs: tag-and-release`, gated on a new tag actually being created) in the same run. Docs (`.claude/skills/parallel-release/SKILL.md`, `KEYSTORE.md`, `.claude/CLAUDE.md`, `README.md`) updated to match.
- **`bump-version.sh` silently no-opped on `DEV_MODE_KEY`.** The script used GNU-only `\+` sed syntax, which matches nothing under BSD/macOS `sed`, so `DEV_MODE_KEY` in `src/constants.ts` never actually updated on a version bump on macOS — dev mode stayed unlocked across releases. `src/constants.ts` now derives both `APP_VERSION` and `DEV_MODE_KEY` from `package.json` at build time instead of via sed; `scripts/bump-version.sh` no longer touches `constants.ts` and hard-verifies its remaining `package.json`/`app.json` substitutions actually applied (`exit 1` on mismatch, since `sed` exits 0 even when it matches nothing).
- **`eas.json` `production` profile had no `ios` section**, so `eas build` fell back to defaults that produced a malformed `.ipa` (missing `Payload/App.app/Info.plist`) and App Store Connect rejected the upload with `altool -21017`. Added `ios: { image: "latest" }` to pin the build to the latest EAS macOS worker and produce a correctly structured, store-signed `.ipa` (#30).
- **Xcode Cloud archives shipped without the JS bundle → instant crash at launch.** `ios/.xcode.env`'s default `NODE_BINARY=$(command -v node)` is re-evaluated inside the PATH-limited "Bundle React Native code and images" build phase, which can't see Homebrew's node — so the bundle script exited early and `main.jsbundle` was never embedded, silently ("Build Succeeded"). `ci_post_clone.sh` now pins node's absolute path into `ios/.xcode.env.local` after prebuild, and the new `ci_post_xcodebuild.sh` fails the build if the bundle is missing (#37).
- **Xcode Cloud build number never incremented → 2nd upload per version rejected.** `expo prebuild --clean` regenerates `ios/` every build, so the static `app.json` `ios.buildNumber` ("1") shipped on every archive. Added `app.config.js` (thin wrapper over `app.json`) that injects Xcode Cloud's monotonic `CI_BUILD_NUMBER` into `ios.buildNumber`, falling back to `app.json` locally; EAS is unaffected (it uses its own remote `autoIncrement`) (#41).
- **Xcode Cloud device archive could fail ~6 min in on a missing Release Hermes artifact.** A partial `pod install` can omit `hermes-ios-<ver>-release.tar.gz`, which the RN Hermes build phase extracts (not downloads) for a Release archive. `ci_post_clone.sh` now verifies that artifact after `pod install`, self-heals from Maven if missing, and fails loudly at post-clone instead of mid-archive (#42).

---

## [0.6.0] — 2026-06-24

### Added
- `lucide-react-native@^1.17.0` — icon library backed by `react-native-svg`
- GitHub community health files: `CODE_OF_CONDUCT.md`, `SECURITY.md`, YAML issue forms (`bug_report.yml`, `feature_request.yml`, `config.yml`), and `.github/PULL_REQUEST_TEMPLATE.md`

### Fixed
- `app.json`: added `ITSAppUsesNonExemptEncryption: false` to `ios.infoPlist` — prevents App Store Connect from requiring manual encryption configuration before an Ad Hoc / internal build can be tested (standard value for apps using only HTTPS with no custom encryption)
- `scripts/init.sh`: reset `package.json`, `app.json`, `src/constants.ts`, and `CHANGELOG.md` to version `0.1.0` during template initialisation so new apps don't inherit the template's release history

---

## [0.5.0] — 2026-05-29

### Fixed
- `package.json`: pinned `react` to exact version `19.2.3` (removed `^` prefix) to prevent accidental minor upgrades breaking Expo SDK 56 compatibility
- `app.json`: removed hardcoded EAS `projectId` from template — new apps no longer inherit a foreign project ID; `eas build` will prompt to link the correct project on first run
- `scripts/init.sh`: added `npm install` step to regenerate `package-lock.json` during bootstrap, ensuring the lockfile reflects the bootstrapped app's package names instead of stale template values

---

## [0.4.0] — 2026-05-29

### CI
- Add `EXPO_TOKEN` secret to enable EAS Preview builds on push to `dev`

### Added
- `VERSIONS.md` — authoritative single-page reference for all pinned dependency versions, core stack table, and upgrade checklist; `.claude/CLAUDE.md` updated to instruct Claude to read and update it on every dependency change
- `expo-constants` and `react-native-svg` (peer deps required by `expo-router` and `posthog-react-native` respectively, flagged by `expo-doctor`)

### Changed
- Bumped all dependencies to Expo SDK 56.0.7 compatible versions: `react-native` 0.79.2 → 0.85.3, `react` 19.0.0 → 19.2.3, `expo-router` 5.0.7 → 56.2.8, `expo-haptics/linking/notifications/splash-screen/status-bar` aligned to SDK 56 versioning, `react-native-pager-view` 6.6.1 → 8.0.1, `react-native-safe-area-context` 5.4.0 → 5.7.0, `react-native-screens` 4.10.0 → 4.25.2, `typescript` 5.9.3 → 6.0.3
- Added `@react-native/jest-preset` as explicit dev dependency (required by `jest-expo` in SDK 56.0.7)

### Fixed
- `app.json`: removed `newArchEnabled` (default-on in SDK 56, no longer a valid field) and migrated `splash` to `expo-splash-screen` plugin config (top-level `splash` field removed in SDK 56 schema)
- `ci.yml`: `expo-doctor` step marked `continue-on-error: true` — the template's unfilled `[APP_*]` placeholders will always fail schema validation until `init.sh` runs; real checks (type-check, lint, test) still gate the PR
- `useTheme.ts`: handle `'unspecified'` value added to `ColorSchemeName` in React Native 0.85 — falls back to `'light'` to keep the colors lookup safe
- `tsconfig.json`: added `"types": ["jest"]` so TypeScript 6 includes Jest globals in test files (TS 6 no longer auto-includes `@types` packages)
- `eas-preview.yml`: `npm ci` → `npm ci --legacy-peer-deps` to resolve `jest-expo` / `@react-native/jest-preset` peer-dep conflict
- `release.yml`: opt in to Node.js 24 runtime via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` to silence GitHub's Node 20 deprecation warning ahead of the 2026-06-02 forced cutover
- Auth placeholder now throws an explicit error instead of silently succeeding — prevents accidental shipping of unwired auth
- Paywall `handleSubscribe` now throws before calling `setSubscription` — prevents fake subscriptions reaching production
- All Zustand stores (`useAppStore`, `useAuthStore`, `usePaywallStore`) validate hydrated AsyncStorage values with type guards before applying to state
- `notifications.ts` `parseTime()` returns a safe fallback (`09:00`) and logs a warning for malformed time strings instead of passing `NaN` to the Expo API
- `isMountedRef` guard added to login async flow to prevent state updates after component unmount
- Obsidian vault path in `scripts/init.sh` now reads `$OBSIDIAN_VAULT_PATH` env var, falling back to `~/Obsidian/Projects` (removes user-specific hardcoded path)
- `PRIVACY_POLICY_URL` moved from a hardcoded string in `settings.tsx` to a `[PRIVACY_POLICY_URL]` placeholder in `src/constants.ts`
- `login.tsx` auth error catch: replaced brittle `err.message.includes("Auth not wired")` string-match with `console.error` + generic user-facing message — prevents internal error text leaking to users when real auth is wired up
- `settings.tsx`: hardcoded `focalstudio.apps@gmail.com` contact replaced with `[SUPPORT_EMAIL]` placeholder exported from `src/constants.ts`
- `release-review.yml`: added `--passWithNoTests=false` to `npm test` step for consistency with `ci.yml`

### Added
- `.eslintrc.json` committed — ESLint rules now consistent across all environments
- `SUPPORT_EMAIL` placeholder added to `src/constants.ts` — replaces hardcoded contact email in settings screen
- `AnalyticsEvent` union type on `track()` in `analytics.ts` — typos in event names are caught at compile time
- `reset()` action on `useOnboardingStore` — enables re-triggering onboarding in tests and dev mode
- `src/store/__tests__/useAppStore.test.ts` — smoke test for store defaults and mutations
- CI (`ci.yml`): `--passWithNoTests=false` flag ensures the test suite is never silently empty
- Notification scheduling errors from `setNotificationPrefs` now surface via `Analytics.appError()` instead of being silently swallowed

### Changed
- README rewritten to document v0.3.0: multi-agent system, branch strategy, CI/CD workflows, release workflow, and further-reading table
- Onboarding placeholder slide subtitles use bracket-delimited text (e.g. `[Slide 1: …]`) to make template copy visually obvious during review
- `.env.example` updated with comments and example key format
- `SETUP.md` and `IDEA.md` Obsidian vault path examples updated from user-specific path to `~/Obsidian/Projects/[APP_NAME]/`

---

## [0.3.0] — 2026-05-27

### Added
- `scripts/init.sh` — automated placeholder replacement script; replaces all `[APP_*]` and `[GITHUB_REPO]` tokens, renames Obsidian templates, initialises git, and creates the GitHub repo
- `.claude/agents/app-bootstrapper.md` — new orchestrator agent for full idea-to-repo bootstrap (Q&A → IDEA.md → init.sh → GitHub issues → parallel onboarding + store listing generation)
- `IDEA.md` — app brief template committed to every new repo as the living source of truth for the project concept, features, and design notes
- `SETUP.md` — Option A (automated Claude bootstrap, ~10 min) added at the top; existing manual steps become Option B
- Barrel exports for `src/components/ui`, `src/components/layout`, `src/components`, `src/store`, `src/services`, `src/hooks` — import multiple items from a single path (e.g. `import { Button, Card } from "@/components/ui"`)
- Haptic feedback on all `Button` presses and `Toggle` changes via `expo-haptics` (previously implemented but disconnected)
- `useAppStore.setNotificationPrefs` now calls `rescheduleNotifications` automatically — changing notification preferences in Settings immediately updates the scheduled notifications

### Changed
- All `app/**` screen imports now use the `@/` path alias instead of relative `../src/` paths — consistent with `tsconfig.json` paths config
- `KEYSTORE.md` rewritten for EAS managed credentials workflow; previous content described a manual Gradle/keytool flow that does not apply to this template

### Removed
- Dead helper functions `pad`, `formatMMSS`, `keyUTCDate` from `src/utils/helpers.ts` — timer/date utilities with no callers in the template; `pickRandom` retained (used by the notifications service)

---

## [0.2.0] — 2026-05-27

### Added
- Multi-agent architecture: five specialist subagents (`ios-frontend`, `backend-integrator`, `release-manager`, `aso-marketing`, `qa-reviewer`) all in `.claude/agents/`, coordinated by the main Opus session — every fork inherits them with no per-machine install
- Vendored skill packs under `.claude/skills/`: frontend (`frontend_design`, `ui-ux-pro-max`, `design-for-ai`), React Native (`rn-*` bundle from gigs-slc), backend (`react-native-expert`, `typescript-pro`), copywriting (`ralph-copywriter`), security (`tob-*` from Trail of Bits), and custom `expo-services` + `aso-rules` skills
- `AGENTS.md` at repo root — short entry-point doc (compulsory pre-work, repo map, agent registry, top mistakes) for any agent or human starting work
- New "Multi-agent workflow" section in `.claude/CLAUDE.md` describing orchestration playbook
- Rewrote `.claude/SKILLS.md` as an agent → skills matrix

### Changed
- `.gitignore` no longer ignores `.claude/skills/` — vendored skills now ship with the template
- Granted `Write` to `qa-reviewer` and `release-manager` so they can honor the long-report disk-handoff convention; scope is restricted to `.claude/scratch/` reports — they still must not modify project source
- Multi-agent workflow now uses a disk-handoff convention for long subagent reports (>~80 lines): the subagent writes the full report to `.claude/scratch/<agent>-<ts>.md` and returns only the path plus a 3-bullet summary. Keeps the orchestrator context lean during mixed/parallel runs. `.claude/scratch/` is gitignored.

---

## [0.1.0] — 2026-05-27

### Added
- Initial project scaffold from focal-studio-app-template
- Migrated from React + Capacitor to React Native + Expo SDK 56 (New Architecture)
- Expo Router file-based navigation (`app/` directory)
- Zustand stores: app, auth, onboarding, paywall
- Design token system (`src/theme/`)
- UI component library: Button, Card, TextInput, Toggle, Badge, Screen, Divider
- Services: analytics (PostHog), haptics, notifications, rating
- AsyncStorage helpers (`src/utils/storage.ts`)
- EAS Build + EAS Submit configuration (`eas.json`)
- GitHub Actions: CI, release automation, EAS preview builds
- Store listing starters for iOS App Store and Google Play

---

<!-- Add new releases above this line, oldest at the bottom. -->
<!-- Template:
## [x.x.x] — YYYY-MM-DD

### Added
- 

### Changed
- 

### Fixed
- 

### Removed
- 
-->
