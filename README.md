# [APP_NAME]

> [APP_TAGLINE]

A Focal Studio app. Built with React Native + Expo SDK 56.

**Before doing anything with Claude Code, read [AGENTS.md](AGENTS.md)** — it's a 5-minute orientation that prevents the most common mistakes.

---

## Quick start

**New app from this template?** See [SETUP.md](SETUP.md) — Option A (automated, ~10 min) or Option B (manual, ~60 min).

**Continuing development on an existing app:**

```bash
npm install
npx expo start --ios
```

Press `i` for iOS Simulator, `a` for Android.

---

## What's in the box

### Tech stack

| Layer | Technology |
|-------|-----------|
| SDK | Expo SDK 56 |
| Runtime | React Native (New Architecture) |
| Language | TypeScript 5.9 |
| Navigation | Expo Router 5 (file-based) |
| State | Zustand 5 |
| Storage | AsyncStorage |
| Build | EAS Build + EAS Submit |
| Testing | Jest + React Native Testing Library |
| Analytics | PostHog RN SDK (EU-hosted, optional) |

### Multi-agent Claude Code system

This template ships with a 7-agent Claude Code orchestration system. Claude (Opus) acts as the orchestrator and delegates to specialist subagents:

| Agent | Role |
|-------|------|
| `app-bootstrapper` | Full new-app Q&A → IDEA.md → GitHub repo + issues |
| `ios-frontend` | React Native + Expo UI, screens, theming |
| `backend-integrator` | Supabase, RevenueCat, PostHog, push notifications |
| `release-manager` | Full release workflow (bump → CHANGELOG → PR) |
| `aso-marketing` | App Store / Google Play listing copy |
| `qa-reviewer` | Pre-PR read-only audit |
| `devops-agent` | Package risk assessment + installation |

See [AGENTS.md](AGENTS.md) for the full orchestration playbook and [.claude/CLAUDE.md](.claude/CLAUDE.md) for the complete spec.

### GitHub Actions CI/CD

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | Every push / PR | Lint, type-check, test |
| `eas-preview.yml` | Push to `dev` | EAS preview build (iOS + Android) |
| `release.yml` | Merge to `main` | Auto-tag + GitHub Release |
| `android-release.yml` | `v[0-9]+.[0-9]+.[0-9]+` tag push (from `release.yml`) | EAS Android production build + Play internal-track submit |
| `release-review.yml` | Push to `release/*` | Quality gate |

---

## Branch strategy

```
main        ← production / store releases only. Never commit directly.
dev         ← integration branch. All features and fixes land here first.
feat/*      ← new features. Branch off dev, PR back to dev.
fix/*       ← bug fixes. Branch off dev, PR back to dev.
release/*   ← release stabilisation. Cut from dev, merge to main + tag.
```

Full workflow including hotfixes: [.claude/CLAUDE.md](.claude/CLAUDE.md).

---

## Project structure

```
app/                   # Expo Router screens
  _layout.tsx          # Root layout (providers, theme, hydration)
  index.tsx            # Entry — redirects to onboarding, auth, or tabs
  onboarding.tsx       # Multi-step onboarding flow
  paywall.tsx          # Subscription / paywall screen
  (auth)/              # Auth screens (login, signup, forgot-password)
  (tabs)/              # Main tab bar (home, settings)

src/
  components/          # Reusable UI (ui/ primitives, layout/ wrappers)
  hooks/               # useTheme
  services/            # analytics, haptics, notifications, ratingService
  store/               # Zustand stores (app, auth, onboarding, paywall)
  theme/               # Design tokens (colors, spacing, typography)
  types/               # Shared TypeScript types
  utils/               # storage helpers, pure utilities
  constants.ts         # App identity + PRIVACY_POLICY_URL placeholder

.claude/
  CLAUDE.md            # Authoritative project spec (read this)
  agents/              # 7 specialist subagent definitions
  skills/              # Vendored Claude skills

.github/workflows/     # CI/CD (see above)
scripts/
  init.sh              # New-app bootstrap (placeholder replacement + GitHub setup)
  bump-version.sh      # Version bump across package.json, app.json, constants.ts
```

---

## Available scripts

| Script | What it does |
|--------|-------------|
| `npx expo start` | Start Metro bundler with dev menu |
| `npm run ios` | Start iOS Simulator directly |
| `npm run android` | Start Android emulator directly |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type-check |
| `npm test` | Run Jest tests |
| `npm run preview:ios` | EAS preview build (iOS) |
| `npm run build:ios` | EAS production build (iOS) |
| `npm run bump-version` | Bump version in package.json + app.json + constants.ts |

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_POSTHOG_KEY` | No | PostHog analytics (disabled if empty) |
| `EXPO_PUBLIC_POSTHOG_HOST` | No | PostHog host (defaults to EU) |

Add `EXPO_TOKEN` to your GitHub repo secrets to enable EAS preview builds in CI.

---

## Release workflow

1. `release-manager` agent (or manually): create `release/x.x.x` off `dev`
2. `bash scripts/bump-version.sh x.x.x`
3. Update `CHANGELOG.md` — move `## [Unreleased]` to `## [x.x.x] — YYYY-MM-DD`
4. Open PR: `release/x.x.x` → `main`
5. On merge: `release.yml` auto-creates tag and GitHub Release
6. Open backmerge PR: `release/x.x.x` → `dev`

On merge to `main`, `release.yml` tags `vX.Y.Z`, which auto-triggers `android-release.yml` (EAS
Android build + submit to the Play internal track). iOS ships in parallel via Xcode Cloud.

Full simultaneous iOS + Android procedure — recurring flow, the one-time Android bootstrap
(keystore, Play Console app, service account), and verification — is the **`parallel-release`**
skill (`/parallel-release`), also referenced from [.claude/CLAUDE.md](.claude/CLAUDE.md). First-time
Android setup: [KEYSTORE.md](KEYSTORE.md).

---

## Further reading

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | **Read first** — agent system orientation and top mistakes |
| [SETUP.md](SETUP.md) | New app bootstrap (two paths) |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Authoritative project spec |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Developer onboarding |
| [DESIGN_STANDARDS.md](DESIGN_STANDARDS.md) | Design token and UI guidelines |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

---

## Claude Code optional features (Pro/Max only)

> These features require a Claude Pro or Max subscription. They are **not enabled in this repo** — both carry extra quota cost. Documented here for awareness.

- **`security-guidance` plugin** — auto-reviews code Claude writes for vulnerabilities as you work. Includes a free per-edit pattern scan (no model calls) plus optional model-backed reviews (Opus 4.7). To try it: `/plugin install security-guidance@claude-plugins-official`, then set `ENABLE_CODE_SECURITY_REVIEW=0` to keep only the free layer. [Docs](https://code.claude.com/docs/en/security-guidance)
- **Agent View** (`claude agents`) — terminal dashboard to dispatch and monitor many parallel Claude Code background sessions at once. Each session consumes quota independently, so running several in parallel multiplies usage. [Docs](https://code.claude.com/docs/en/agent-view)

---

## Privacy & store compliance

Every app built from this template ships two features that Google Play's **Data safety**
form and Apple's App Privacy questionnaire require once the app supports accounts:

| Feature | Where | Notes |
|---|---|---|
| **Account deletion** | Settings → Danger Zone → Delete Account | Two-step confirmation, then `useAuthStore.deleteAccount()`. The template scaffold only clears local state — **wire your backend's delete call into it before shipping** (see the notes at the bottom of `src/store/useAuthStore.ts`). |
| **Analytics opt-out** | Settings → Privacy → Analytics | Persisted across restarts and re-applied to the analytics service on hydration. |
| **Data deletion by email** | Settings → Support → Request Data Deletion | `mailto:` fallback for users who no longer have the app installed. Stores expect this path to exist regardless. |

### Privacy policy page

Stores require a publicly reachable, app-specific privacy policy URL, and Play needs a
deletion URL that explains how to remove an account.

1. Copy [`store-listing/privacy-policy-template.html`](store-listing/privacy-policy-template.html)
   into the [focalstudio.github.io](https://github.com/focalstudio/focalstudio.github.io)
   repo as `privacy-<app-slug>.html`.
2. Replace every `[PLACEHOLDER]` — search the file for `[` to find them all.
3. Fill in section 6 to match what your app's deletion actually does, including anything
   deliberately **retained** after deletion. Getting this wrong is a store-rejection risk.
4. Merge to `main` (Pages publishes from the repo root), then set `PRIVACY_POLICY_URL` in
   `src/constants.ts` and update both files in `store-listing/`.

Point Play's account-deletion URL at the `#delete` anchor of the published page.

Current value: [PRIVACY_POLICY_URL]

---

## License

© 2026 Focal Studio. All rights reserved.
