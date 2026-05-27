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
| `eas-preview.yml` | Push to `dev` | EAS preview build (iOS) |
| `release.yml` | Merge to `main` | Auto-tag + GitHub Release |
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

Full checklist including App Store upload: [.claude/CLAUDE.md](.claude/CLAUDE.md).

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

## Privacy policy

[PRIVACY_POLICY_URL]

---

## License

© 2026 Focal Studio. All rights reserved.
