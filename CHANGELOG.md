# Changelog

All notable changes to [APP_NAME] are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Added
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
- 

### Fixed
- `app/(tabs)/settings.tsx`: guard the account-deletion error path against state updates after unmount. `performDelete()` now tracks mount state with an `isMountedRef` and skips the `Alert` + `setIsDeleting(false)` if the screen unmounted mid-request — matching the existing pattern in `app/(auth)/login.tsx`.

### Removed
- 

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
