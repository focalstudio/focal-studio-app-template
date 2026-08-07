#!/bin/bash
# Usage: bash scripts/init.sh --name "My App" --slug "my-app" --id "com.focalstudio.myapp" \
#                              --color "#007AFF" --color-dark "#0A84FF" \
#                              --tagline "The app that does X" \
#                              --repo "focalstudio/my-app" [--no-git] [--no-github] [--force]
#
# Replaces every APP_* and GITHUB_REPO placeholder across the project, renames
# Obsidian template files, initialises git, and creates the GitHub repo.
#
# The two token names above are deliberately written WITHOUT their surrounding
# brackets. This script is a *.sh file and so is caught by its own --include
# filter, meaning replace() rewrites this file on disk mid-run — a bracketed
# token here would be substituted into the generated app's copy, leaving it
# reading "Replaces all [APP_*] and acme/my-app placeholders". Same hazard the
# heredocs further down already guard against.
#
# Safe to re-run: exits early when placeholders are already gone (override with --force).

set -e

# ── Argument parsing ──────────────────────────────────────────────────────────
APP_NAME=""
APP_SLUG=""
APP_ID=""
APP_COLOR=""
APP_COLOR_DARK=""
APP_TAGLINE=""
GITHUB_REPO=""
INIT_GIT=true
INIT_GITHUB=true
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)        APP_NAME="$2";       shift 2 ;;
    --slug)        APP_SLUG="$2";       shift 2 ;;
    --id)          APP_ID="$2";         shift 2 ;;
    --color)       APP_COLOR="$2";      shift 2 ;;
    --color-dark)  APP_COLOR_DARK="$2"; shift 2 ;;
    --tagline)     APP_TAGLINE="$2";    shift 2 ;;
    --repo)        GITHUB_REPO="$2";    shift 2 ;;
    --no-git)      INIT_GIT=false;      shift ;;
    --no-github)   INIT_GITHUB=false;   shift ;;
    --force)       FORCE=true;          shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Validation ────────────────────────────────────────────────────────────────
ERRORS=0
[[ -z "$APP_NAME" ]]       && echo "Error: --name is required"        && ERRORS=$((ERRORS+1))
[[ -z "$APP_SLUG" ]]       && echo "Error: --slug is required"        && ERRORS=$((ERRORS+1))
[[ -z "$APP_ID" ]]         && echo "Error: --id is required"          && ERRORS=$((ERRORS+1))
[[ -z "$APP_COLOR" ]]      && echo "Error: --color is required"       && ERRORS=$((ERRORS+1))
[[ -z "$APP_COLOR_DARK" ]] && echo "Error: --color-dark is required"  && ERRORS=$((ERRORS+1))
[[ -z "$APP_TAGLINE" ]]    && echo "Error: --tagline is required"     && ERRORS=$((ERRORS+1))
[[ -z "$GITHUB_REPO" ]]    && echo "Error: --repo is required"        && ERRORS=$((ERRORS+1))
[[ $ERRORS -gt 0 ]] && exit 1

# Validate hex color format (#RRGGBB)
if ! echo "$APP_COLOR" | grep -qE '^#[0-9A-Fa-f]{6}$'; then
  echo "Error: --color must be a 6-digit hex color (e.g. #007AFF)"
  exit 1
fi
if ! echo "$APP_COLOR_DARK" | grep -qE '^#[0-9A-Fa-f]{6}$'; then
  echo "Error: --color-dark must be a 6-digit hex color (e.g. #0A84FF)"
  exit 1
fi
# Validate bundle ID format (e.g. com.studio.appname)
if ! echo "$APP_ID" | grep -qE '^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){2,}$'; then
  echo "Error: --id must be a valid bundle ID (e.g. com.focalstudio.myapp)"
  exit 1
fi

# ── Idempotency guard ─────────────────────────────────────────────────────────
if grep -q "\[APP_NAME\]" app.json 2>/dev/null; then
  : # Placeholders present — proceed normally
elif [[ "$FORCE" == "true" ]]; then
  echo "⚠️  --force passed: proceeding even though placeholders appear to be gone."
else
  echo "⚠️  [APP_NAME] not found in app.json — looks like this repo is already initialised."
  echo "   Re-run with --force to override."
  exit 0
fi

echo "Initialising $APP_NAME ($APP_SLUG)..."

# ── File-type filter (used in every grep/sed call) ────────────────────────────
EXTS=(
  --include="*.ts"
  --include="*.tsx"
  --include="*.json"
  --include="*.md"
  --include="*.sh"
)

# ── Replacement helper — macOS (sed -i '') and Linux (sed -i) compatible ──────
replace() {
  local PATTERN="$1"
  local REPLACEMENT="$2"
  # Escape forward-slashes and & in replacement for sed
  local ESC
  ESC=$(printf '%s\n' "$REPLACEMENT" | sed 's/[\/&]/\\&/g')

  local FILES
  FILES=$(grep -rl "$PATTERN" . "${EXTS[@]}" 2>/dev/null \
    | grep -v node_modules \
    | grep -v "\.git/" \
    | grep -v package-lock.json || true)

  [[ -z "$FILES" ]] && return 0

  # Loop instead of xargs: the Obsidian template filenames contain spaces
  # (e.g. "[APP_NAME] Dashboard.md"), which xargs would split into separate args.
  if [[ "$(uname)" == "Darwin" ]]; then
    while IFS= read -r f; do sed -i '' "s/${PATTERN}/${ESC}/g" "$f"; done <<< "$FILES"
  else
    while IFS= read -r f; do sed -i  "s/${PATTERN}/${ESC}/g" "$f"; done <<< "$FILES"
  fi
}

# ── Replacements — ORDER MATTERS to avoid partial-match collisions ─────────────
# [APP_COLOR_DARK] must come before [APP_COLOR] (shares a prefix)
# [APP_SLUG]       must come before [APP_NAME]  (shares a prefix)

echo "  Replacing [APP_COLOR_DARK]..."
replace "\[APP_COLOR_DARK\]" "$APP_COLOR_DARK"

echo "  Replacing [APP_COLOR]..."
replace "\[APP_COLOR\]" "$APP_COLOR"

echo "  Replacing [APP_SLUG]..."
replace "\[APP_SLUG\]" "$APP_SLUG"

echo "  Replacing [APP_NAME]..."
replace "\[APP_NAME\]" "$APP_NAME"

# Obsidian wikilinks (e.g. [[APP_NAME Dashboard]]) don't have an immediate closing
# bracket after APP_NAME, so the replacement above doesn't catch them.
echo "  Replacing [[APP_NAME wikilinks..."
replace "\[\[APP_NAME " "[[$APP_NAME "

echo "  Replacing [APP_ID]..."
replace "\[APP_ID\]" "$APP_ID"

echo "  Replacing [APP_TAGLINE]..."
replace "\[APP_TAGLINE\]" "$APP_TAGLINE"

echo "  Replacing [GITHUB_REPO]..."
replace "\[GITHUB_REPO\]" "$GITHUB_REPO"

# ── Version reset (new apps always start at 0.1.0, not the template version) ──
# src/constants.ts is deliberately not touched: APP_VERSION and DEV_MODE_KEY are
# derived from package.json, so rewriting it here would only reintroduce the
# desync the derivation exists to prevent.
echo "  Resetting version to 0.1.0..."
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' 's/"version": "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"/"version": "0.1.0"/' package.json
  sed -i '' 's/"version": "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"/"version": "0.1.0"/' app.json
else
  sed -i 's/"version": "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"/"version": "0.1.0"/' package.json
  sed -i 's/"version": "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"/"version": "0.1.0"/' app.json
fi
cat > CHANGELOG.md << EOF
# Changelog

All notable changes to $APP_NAME are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

---
EOF
echo "  ✅  Version reset to 0.1.0"

# ── Tracking-file reset (STATUS.md / ROADMAP.md track the TEMPLATE's own work) ─
# Both files are ordinary *.md, so the replace() pass above only swaps the app-name
# placeholder inside them — a new app would otherwise start life owning the
# template's own status and roadmap. Overwrite them with genuine starters instead.
#
# The bodies use a QUOTED heredoc (<< 'EOF') deliberately, for two reasons:
#   1. They contain backticks; an unquoted heredoc would run those as command
#      substitution rather than writing them literally.
#   2. No placeholder token may appear inside them. init.sh is itself a *.sh
#      caught by its own --include filter, so replace() rewrites this file on
#      disk mid-run; a token in the heredoc would be substituted at bootstrap.
#      The app name is echoed separately instead, expanded from the variable.
#      (Execution is safe regardless: sed -i renames, so the running shell keeps
#      reading the original unlinked inode.)
echo "  Resetting STATUS.md and ROADMAP.md..."
{
  echo "# $APP_NAME — Status"
  echo ""
  echo "_Updated: $(date +%Y-%m-%d)_"
  echo ""
  echo "**Version:** 0.1.0   **Stage:** New app"
  cat << 'EOF'

## Now
Freshly bootstrapped from the template. Nothing built yet.

## Next
- Replace the placeholder splash / icon / adaptive-icon assets
- Wire a backend: `bash scripts/add-backend.sh supabase` (or `firebase`)
- Write the onboarding slides in `app/onboarding.tsx`

## Blockers
None.
EOF
} > STATUS.md

{
  echo "# $APP_NAME — Roadmap"
  cat << 'EOF'

> Starter roadmap. Replace these phases and substages with the real ones for your app.
> `/standup` computes progress bars from the `## Phase` headings and their checkboxes;
> `/wrap` checks boxes off as work ships. Headings **must** start with `## Phase`.

## Phase 1 — Foundation
- [ ] Replace placeholder splash / icon / adaptive-icon assets
- [ ] Onboarding slides finalised (`app/onboarding.tsx`)
- [ ] Backend wired (`scripts/add-backend.sh`)

## Phase 2 — Core Product
- [ ] Primary feature screens built
- [ ] Auth flow working end to end
- [ ] Paywall wired (bash scripts/add-paywall.sh revenuecat)

## Phase 3 — Store Readiness
- [ ] Store listing copy drafted (`store-listing/`)
- [ ] Data-safety checklist passing on a production build
- [ ] First release cut and submitted (iOS + Android)

## Phase 4 — Growth
- [ ] Analytics events instrumented (PostHog)
- [ ] Post-launch iteration backlog triaged
EOF
} > ROADMAP.md
echo "  ✅  STATUS.md and ROADMAP.md reset to starters"

# ── Regenerate lockfile so it carries the real app name/version ───────────────
# package-lock.json is excluded from sed replacements above (wrong tool for JSON
# with checksums). npm install rewrites it cleanly with the post-replace values.
echo "  Regenerating package-lock.json..."
npm install --legacy-peer-deps --silent

# ── Rename Obsidian template files (filename contains literal [APP_NAME]) ─────
OBSIDIAN_SRC="./obsidian-templates"
if [[ -d "$OBSIDIAN_SRC" ]]; then
  echo "  Renaming Obsidian template files..."
  for f in "$OBSIDIAN_SRC"/\[APP_NAME\]*; do
    [[ -f "$f" ]] || continue
    NEWNAME="${f/\[APP_NAME\]/$APP_NAME}"
    mv "$f" "$NEWNAME"
    echo "    $f → $NEWNAME"
  done
fi

# ── Copy templates to Obsidian vault (silently skips if vault doesn't exist) ──
# Set OBSIDIAN_VAULT_PATH env var to override the default location.
VAULT_BASE="${OBSIDIAN_VAULT_PATH:-$HOME/Obsidian/Projects}"
VAULT_DIR="$VAULT_BASE/$APP_NAME"
if [[ -d "$VAULT_BASE" ]]; then
  echo "  Copying templates to Obsidian vault: $VAULT_DIR"
  mkdir -p "$VAULT_DIR"
  cp "$OBSIDIAN_SRC"/*.md "$VAULT_DIR/" 2>/dev/null || true
  echo "  Obsidian vault populated."
else
  echo "  ℹ️  Obsidian vault base not found — skipping vault copy."
fi

# ── Git initialisation ────────────────────────────────────────────────────────
if [[ "$INIT_GIT" == "true" ]]; then
  if [[ -d ".git" ]]; then
    echo "  ⚠️  .git already exists — skipping git init. Remove .git manually to re-initialise."
  else
    echo "  Initialising git..."
    git init
    git checkout -b main
    git add .
    git commit -m "chore: initialise $APP_NAME from focal-studio-app-template

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
    git checkout -b dev
    echo "  Git initialised. Current branch: dev"
  fi
fi

# ── GitHub repo creation ──────────────────────────────────────────────────────
if [[ "$INIT_GITHUB" == "true" && "$INIT_GIT" == "true" ]]; then
  if command -v gh &>/dev/null; then
    echo "  Creating GitHub repo: $GITHUB_REPO..."
    gh repo create "$GITHUB_REPO" --private --source=. --remote=origin 2>/dev/null || \
      echo "  ⚠️  gh repo create failed — repo may already exist, or you may need to push manually."

    # Align the remote with however `gh` actually authenticates.
    #
    # `gh repo create --source=.` can leave an SSH remote even when
    # `gh config get git_protocol` is https — and on a machine that authenticates
    # to GitHub through gh's HTTPS token with no SSH key registered, every push
    # below then dies with "Permission denied (publickey)". The repo is created
    # but stays empty, which is exactly how this was found.
    if [[ "$(gh config get git_protocol 2>/dev/null)" == "https" ]]; then
      REMOTE_URL="$(git remote get-url origin 2>/dev/null || echo "")"
      if [[ "$REMOTE_URL" == git@github.com:* ]]; then
        echo "  Switching origin to HTTPS to match your gh auth..."
        git remote set-url origin "https://github.com/${GITHUB_REPO}.git"
      fi
    fi

    # Push both branches.
    #
    # stderr is deliberately NOT sent to /dev/null. It was, and a failed push
    # printed only "push manually" with no reason — the actual cause (an SSH
    # remote, a missing key, a name collision) was invisible, leaving an empty
    # repo and no way to tell why.
    git checkout main
    git push -u origin main || echo "  ⚠️  Could not push main — see the error above, then push manually."
    git checkout dev
    git push -u origin dev || echo "  ⚠️  Could not push dev — see the error above, then push manually."

    # Create the full issue label set. This used to hardcode four labels and assume
    # GitHub's defaults were already there — they are not reliably created for a repo
    # made with `gh repo create --source=.`, so generated apps ended up with 4 of 18
    # and could not follow the issue convention they ship with, nor apply `e2e` (#127).
    echo "  Syncing issue labels..."
    bash "$(dirname "${BASH_SOURCE[0]}")/sync-labels.sh" --repo "$GITHUB_REPO" \
      || echo "  ⚠️  Label sync failed — run: bash scripts/sync-labels.sh --repo $GITHUB_REPO"
    echo "  GitHub repo ready."
  else
    echo "  ⚠️  gh CLI not found — skipping GitHub repo creation. Push manually."
  fi
fi

# ── Verification ──────────────────────────────────────────────────────────────
echo ""
echo "Verification:"
# Match a REAL placeholder — `[APP_NAME]` — and not the many places that merely
# talk about one.
#
# The old pattern was the bare prefix `\[APP_`, which also matched every escaped
# mention in documentation and in this script itself: SETUP.md's worked example,
# `.claude/agents/app-bootstrapper.md`, the grep instruction in
# store-listing/play-store-listing.md, and 14 lines of init.sh. A clean bootstrap
# reported "23 placeholder line(s) still found" and the ✅ branch was unreachable
# — while app-bootstrapper.md instructs the agent to treat exactly that as a
# blocker and investigate before continuing.
#
# Requiring the closing `]` unescaped is what separates the two: a documented
# mention is written `\[APP_NAME\]`, so the literal `[APP_NAME]` never appears in
# it. Verified both ways — 130 hits against the un-bootstrapped template, 0
# against a freshly bootstrapped app.
PLACEHOLDER_RE='\[APP_[A-Z_]+\]'

REMAINING=$(grep -rE "$PLACEHOLDER_RE" . "${EXTS[@]}" 2>/dev/null \
  | grep -v node_modules | grep -v "\.git/" | grep -v package-lock.json \
  | wc -l | tr -d ' ')

if [[ "$REMAINING" -eq 0 ]]; then
  echo "  ✅ No [APP_*] placeholders remaining."
else
  echo "  ⚠️  $REMAINING placeholder line(s) still found:"
  grep -rE "$PLACEHOLDER_RE" . "${EXTS[@]}" 2>/dev/null \
    | grep -v node_modules | grep -v "\.git/" | grep -v package-lock.json | head -10
fi

echo "  app.json name:    $(node -p "require('./app.json').expo.name" 2>/dev/null || echo 'check manually')"
echo "  package.json:     $(node -p "require('./package.json').name" 2>/dev/null || echo 'check manually')"
echo ""
echo "Done. Next steps:"
echo "  1. npm install"
echo "  2. npx expo start --ios"
echo "  3. eas login && eas build:configure  (commit eas.json)"
echo "  4. Add EXPO_TOKEN to GitHub repo secrets"
echo "  5. Create .env.local from .env.example (PostHog key)"
echo "  6. Review IDEA.md and refine the feature list"