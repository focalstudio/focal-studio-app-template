# New App Setup Guide

---

## Option A — Automated bootstrap (Claude Code) ✨ Recommended

**Estimated time: ~10 minutes**

Claude conducts a Q&A, replaces all placeholders, creates the GitHub repo, seeds GitHub issues, updates onboarding slides, and generates an initial store listing draft — all in one workflow.

### Prerequisites

- **Claude Code** CLI installed and running (`npm install -g @anthropic-ai/claude-code`)
- **`gh` CLI** installed and authenticated (`brew install gh && gh auth login`)
- The template cloned locally and `cd`'d into it

### Steps

1. **Clone and detach from the template remote:**
   ```bash
   git clone https://github.com/fpmartinez10/focal-studio-app-template.git <your-app-slug>
   cd <your-app-slug>
   rm -rf .git
   ```

2. **Open Claude Code and trigger the bootstrap:**
   ```
   Bootstrap a new app: [describe your app idea in one or two sentences]
   ```

3. **Answer the 7 questions** Claude asks (app name, bundle ID, GitHub repo, colors, feature list, target user).

4. **Confirm the parameter summary** Claude shows you — type "yes" to proceed.

5. **Follow the manual next steps** in Claude's final report (npm install, EAS setup, PostHog key).

---

## Option B — Manual setup

**Estimated time: ~60 minutes**

This guide takes you from cloning the template to a running React Native app on iOS Simulator, with CI/CD, analytics, notifications, and an Obsidian project vault.

---

## Prerequisites

Before starting, install:
- **Node.js 22+** (`node --version`)
- **Expo CLI** (`npm install -g expo-cli`)
- **EAS CLI** (`npm install -g eas-cli`)
- **Xcode 15+** (macOS only — required for iOS Simulator)
- **Watchman** (`brew install watchman`)
- **Obsidian** with the **Kanban** community plugin (for project docs)
- **Claude Code** CLI (`npm install -g @anthropic-ai/claude-code`)

---

## Phase 1 — Clone and name (10 min)

### 1.1 Clone the template

```bash
git clone https://github.com/fpmartinez10/focal-studio-app-template.git <your-app-slug>
cd <your-app-slug>
rm -rf .git
git init
git checkout -b main
```

### 1.2 Replace all placeholders

Run this one-liner (replace values in `<>` with your actual app info):

```bash
APP_NAME="My App"
APP_SLUG="my-app"
APP_ID="com.yourstudio.myapp"
APP_COLOR="#007AFF"
APP_COLOR_DARK="#0A84FF"

grep -rl "\[APP_NAME\]" . --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" | xargs sed -i '' "s/\[APP_NAME\]/$APP_NAME/g"
grep -rl "\[APP_SLUG\]" . --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" | xargs sed -i '' "s/\[APP_SLUG\]/$APP_SLUG/g"
grep -rl "\[APP_ID\]"   . --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" | xargs sed -i '' "s/\[APP_ID\]/$APP_ID/g"
grep -rl "\[APP_COLOR\]" . --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" | xargs sed -i '' "s/\[APP_COLOR\]/$APP_COLOR/g"
grep -rl "\[APP_COLOR_DARK\]" . --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" | xargs sed -i '' "s/\[APP_COLOR_DARK\]/$APP_COLOR_DARK/g"
```

### 1.3 Verify no placeholders remain

```bash
grep -r "\[APP_" . --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules
```

No output = clean.

---

## Phase 2 — Install and run (10 min)

```bash
npm install
npx expo-doctor      # verify Expo config health
npx expo start --ios # open iOS Simulator
```

You should see:
1. Metro bundler starts
2. iOS Simulator opens
3. Onboarding slides appear
4. Complete onboarding → Login screen
5. (Skip auth for now — wire later)

Run tests:
```bash
npm test
npm run type-check
npm run lint
```

All should pass.

---

## Phase 3 — Configure EAS Build (15 min)

### 3.1 Create an Expo account

[expo.dev](https://expo.dev) → Sign up → verify email.

### 3.2 Log in and configure

```bash
eas login
eas build:configure
```

This generates/updates `eas.json`. Commit the result.

### 3.3 Set GitHub Actions secret

In your GitHub repo → Settings → Secrets → New secret:
- Name: `EXPO_TOKEN`
- Value: your Expo access token (expo.dev → Account → Access tokens)

### 3.4 Trigger a preview build

Push to `dev` — `eas-preview.yml` runs automatically. Or trigger manually:

```bash
eas build --platform ios --profile preview
```

---

## Phase 4 — Set up analytics (5 min)

1. Create a project at [posthog.com](https://eu.posthog.com) (EU region).
2. Copy your project API key.
3. Create `.env.local`:
   ```bash
   EXPO_PUBLIC_POSTHOG_KEY=phc_xxxxx
   EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
   ```
4. Add `EXPO_PUBLIC_POSTHOG_KEY` to GitHub Actions secrets.

Leave empty to disable analytics entirely.

---

## Phase 5 — Set up Obsidian vault (5 min)

Create the vault folder:
```
~/Obsidian/Projects/[APP_NAME]/
```
> Set `OBSIDIAN_VAULT_PATH` before running `init.sh` if your vault lives elsewhere.

Copy the templates from `obsidian-templates/` into the vault folder. Ask Claude to generate a Dashboard, Roadmap, and Kanban doc using the patterns in `CLAUDE.md`.

---

## Phase 6 — Wire auth and paywall (ongoing)

Auth:
- Pick your backend: [Firebase](https://firebase.google.com), [Supabase](https://supabase.com), or custom API.
- Install the SDK and replace the placeholder `handleLogin` / `handleSignup` calls in `app/(auth)/`.
- See `src/store/useAuthStore.ts` for the integration comment.

Paywall:
- Install [RevenueCat](https://www.revenuecat.com/docs/getting-started/installation/react-native): `npx expo install react-native-purchases`
- Follow the RevenueCat Expo guide to configure your offerings.
- Replace the placeholder in `app/paywall.tsx` and `src/store/usePaywallStore.ts`.

---

## Checklist

- [ ] Placeholders replaced (`grep -r "\[APP_" .` returns nothing)
- [ ] `npm test` passes
- [ ] `npm run type-check` passes
- [ ] App runs in iOS Simulator
- [ ] EAS configured (eas.json committed, EXPO_TOKEN secret set)
- [ ] Analytics key set (or confirmed empty = disabled)
- [ ] Git remote set (`git remote add origin <url>`)
- [ ] First commit pushed
- [ ] dev branch created and pushed
