# New App Setup Guide

**Estimated time: ~75 minutes**

This guide takes you from cloning the template to a buildable, testable app scaffold with CI/CD, analytics, notifications, Android signing, and an Obsidian project vault.

---

## Prerequisites

Before starting, install:
- **Node.js 22+** (`node --version`)
- **Java 21 + Android SDK** — install [Android Studio](https://developer.android.com/studio) to get both
- **Xcode** (macOS, for iOS only)
- **Obsidian** with the **Kanban** community plugin (for project docs)
- **Claude Code** CLI (`npm install -g @anthropic-ai/claude-code`)

---

## Phase 1 — Clone and name (15 min)

### 1.1 Clone the template

```bash
git clone https://github.com/fpmartinez10/focal-studio-app-template.git <your-app-slug>
cd <your-app-slug>
rm -rf .git
git init
```

### 1.2 Replace all placeholders

Fill in your values, then run this one-liner from the repo root:

```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "*.json" -o -name "*.html" -o -name "*.yml" -o -name "*.css" -o -name "*.js" \) \
  ! -path "./.git/*" \
  ! -path "./node_modules/*" \
  -exec sed -i '' \
    -e 's/\[APP_NAME\]/MyAppName/g' \
    -e 's/\[APP_SLUG\]/my-app-slug/g' \
    -e 's/\[APP_ID\]/com.fpmartinez10.myapp/g' \
    -e 's/\[APP_COLOR\]/#007aff/g' \
    -e 's/\[APP_COLOR_DARK\]/#409cff/g' \
    -e 's/\[GITHUB_REPO\]/fpmartinez10\/my-app-slug/g' \
    -e 's/\[APP_ICON_EMOJI\]/🚀/g' \
    -e 's/\[APP_TAGLINE\]/Your one-sentence pitch here./g' \
  {} +
```

> Adjust the replacement values on the right side of each `-e` pair.

### 1.3 Verify — no placeholders remain

```bash
grep -r "\[APP_" . --include="*.ts" --include="*.tsx" --include="*.md" \
  --include="*.json" --include="*.html" --include="*.yml" \
  --include="*.css" --include="*.js"
```

Expected: **empty output**. If any matches appear, fix them manually.

### 1.4 Update package.json version field

Confirm `"version": "0.1.0"` in `package.json` matches what you intend to ship as first build.

---

## Phase 2 — Local dev (10 min)

```bash
npm install
npm run dev       # → http://localhost:5173
npm test          # all tests should pass
npm run lint      # zero warnings
```

If lint reports errors, fix them before continuing.

---

## Phase 3 — Android setup (30 min)

### 3.1 Add Android platform

```bash
npx cap add android
```

### 3.2 Generate app icons

Prepare a square PNG (1024×1024, no transparent background) and run:

```bash
npm run gen:icons -- --icon public/icon.png
```

This fills `android/app/src/main/res/` with all required icon sizes.

### 3.3 Sync web assets to Android

```bash
npm run build
npx cap sync android
```

### 3.4 Generate keystore (once per app)

```bash
keytool -genkeypair -v \
  -keystore android/<your-app-slug>-release.jks \
  -alias <your-app-slug> \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Save the passwords in your password manager immediately.

### 3.5 Create keystore.properties

Create `android/keystore.properties` (already in `.gitignore`):

```properties
storeFile=<your-app-slug>-release.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=<your-app-slug>
keyPassword=YOUR_KEY_PASSWORD
```

See [KEYSTORE.md](KEYSTORE.md) for the `build.gradle` signing config snippet.

### 3.6 Create GitHub repository secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `VITE_POSTHOG_KEY` | PostHog project API key |
| `VITE_SENTRY_DSN` | Sentry DSN |
| `KEYSTORE_BASE64` | `base64 android/<slug>-release.jks` |
| `KEY_ALIAS` | `<your-app-slug>` |
| `KEY_PASSWORD` | Your key password |
| `STORE_PASSWORD` | Your keystore password |

---

## Phase 4 — Claude Code permissions (5 min)

```bash
cp .claude/settings.local.json.template .claude/settings.local.json
```

Review the allowlist in `settings.local.json` and adjust paths if needed (e.g. if `gh` is not at `/opt/homebrew/bin/gh`).

---

## Phase 5 — GitHub setup (10 min)

### 5.1 Push the repo

```bash
git add .
git commit -m "Initial scaffold from focal-studio-app-template"
git branch -M main
git remote add origin https://github.com/<GITHUB_REPO>.git
git push -u origin main
```

### 5.2 Create a dev branch

```bash
git checkout -b dev
git push -u origin dev
```

### 5.3 Branch protection

In GitHub **Settings → Branches**, add a rule for `main`:
- Require PR before merging
- Require status checks: `build` (from `ci.yml`)

### 5.4 Create GitHub labels

```bash
gh label create "priority: critical" --color "B60205"
gh label create "priority: high"     --color "E4E669"
gh label create "priority: medium"   --color "0075CA"
gh label create "priority: low"      --color "CFD3D7"
gh label create "type: feat"         --color "0052CC"
gh label create "type: fix"          --color "B60205"
gh label create "type: chore"        --color "E4E669"
gh label create "type: refactor"     --color "5319E7"
gh label create "platform: android"  --color "A2EEEF"
gh label create "platform: ios"      --color "A2EEEF"
gh label create "platform: web"      --color "A2EEEF"
```

### 5.5 Enable template repository (optional)

If this repo itself should be forkable as a template, go to **Settings → General** and check "Template repository".

---

## Phase 6 — Obsidian vault (10 min)

```bash
cp -r obsidian-templates/ \
  "/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/<YourAppName>/"
```

Then in Obsidian:
1. Rename the four files: replace `[APP_NAME]` with your actual app name.
2. Open `<AppName> Kanban.md` — it should render as a board (requires Kanban plugin).
3. Update the frontmatter `tags` in each file.
4. Fill in the Dashboard's milestone target dates.

---

## Phase 7 — Focal Studio website (10 min)

### 7.1 Add app card to index.html

Open `/Users/fperezmartinez/Desktop/fpmartinez10.github.io/index.html` and find the `<!-- ADD NEW APP -->` comment. Add a card block:

```html
<div class="app-card">
  <div class="app-icon">[APP_ICON_EMOJI]</div>
  <div class="app-info">
    <h3 class="app-name">[APP_NAME]</h3>
    <p class="app-tagline">[APP_TAGLINE]</p>
    <div class="app-links">
      <a href="app-[APP_SLUG].html" class="btn btn-secondary btn-sm">Learn more</a>
    </div>
  </div>
</div>
```

### 7.2 Add app card to apps.html

Same card block in `/Users/fperezmartinez/Desktop/fpmartinez10.github.io/apps.html`.

### 7.3 Create app page

Copy an existing app page (e.g. `app-procrastipet.html`) to `app-[APP_SLUG].html` and update the content.

---

## Verification checklist

Run these after completing all phases:

| Check | Command | Expected |
|---|---|---|
| No placeholders | `grep -r "\[APP_" . --include="*.{ts,tsx,md,json,html,yml}"` | Empty output |
| Build | `npm run build` | Zero errors, `dist/` created |
| Type check | `npx tsc --noEmit` | Zero errors |
| Lint | `npm run lint` | Zero warnings |
| Tests | `npm test` | All pass |
| Android sync | `npm run build && npx cap sync android` | No errors |

---

## What's next

Once the scaffold is passing all checks:

1. Open [CONTRIBUTING.md](CONTRIBUTING.md) for the day-to-day dev workflow.
2. Open your Obsidian Dashboard and start filling in Gate 1 items.
3. Start building your core feature — branch off `dev` with `feat/<description>`.
