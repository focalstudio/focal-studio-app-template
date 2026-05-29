# Changelog

All notable changes to [APP_NAME] are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

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
