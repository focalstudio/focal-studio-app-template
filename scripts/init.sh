#!/bin/bash
# Usage: bash scripts/init.sh --name "My App" --slug "my-app" --id "com.focalstudio.myapp" \
#                              --color "#007AFF" --color-dark "#0A84FF" \
#                              --tagline "The app that does X" \
#                              --repo "focallstudio/my-app" [--no-git] [--no-github] [--force]
#
# Replaces all [APP_*] and [GITHUB_REPO] placeholders across the project, renames
# Obsidian template files, initialises git, and creates the GitHub repo.
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

  if [[ "$(uname)" == "Darwin" ]]; then
    echo "$FILES" | xargs sed -i '' "s/${PATTERN}/${ESC}/g"
  else
    echo "$FILES" | xargs sed -i  "s/${PATTERN}/${ESC}/g"
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

echo "  Replacing [APP_ID]..."
replace "\[APP_ID\]" "$APP_ID"

echo "  Replacing [APP_TAGLINE]..."
replace "\[APP_TAGLINE\]" "$APP_TAGLINE"

echo "  Replacing [GITHUB_REPO]..."
replace "\[GITHUB_REPO\]" "$GITHUB_REPO"

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
VAULT_BASE="/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects"
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

    # Push both branches
    git checkout main
    git push -u origin main 2>/dev/null || echo "  ⚠️  Could not push main — push manually."
    git checkout dev
    git push -u origin dev 2>/dev/null || echo "  ⚠️  Could not push dev — push manually."

    # Create milestone labels not present on a default GitHub repo
    echo "  Creating milestone labels..."
    gh label create "open-beta"     --color "0075ca" --description "Required for open beta launch"  --repo "$GITHUB_REPO" 2>/dev/null || true
    gh label create "public"        --color "e4e669" --description "Required for public v1 launch"   --repo "$GITHUB_REPO" 2>/dev/null || true
    gh label create "post-release"  --color "d93f0b" --description "Follow-up after release ships"  --repo "$GITHUB_REPO" 2>/dev/null || true
    gh label create "chore"         --color "fef2c0" --description "Maintenance, tooling, CI"        --repo "$GITHUB_REPO" 2>/dev/null || true
    echo "  GitHub repo ready."
  else
    echo "  ⚠️  gh CLI not found — skipping GitHub repo creation. Push manually."
  fi
fi

# ── Verification ──────────────────────────────────────────────────────────────
echo ""
echo "Verification:"
REMAINING=$(grep -r "\[APP_" . "${EXTS[@]}" 2>/dev/null \
  | grep -v node_modules | grep -v "\.git/" | grep -v package-lock.json \
  | wc -l | tr -d ' ')

if [[ "$REMAINING" -eq 0 ]]; then
  echo "  ✅ No [APP_*] placeholders remaining."
else
  echo "  ⚠️  $REMAINING placeholder line(s) still found:"
  grep -r "\[APP_" . "${EXTS[@]}" 2>/dev/null \
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