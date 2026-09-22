#!/bin/bash
# Usage: bash scripts/provision-cross-repo-app.sh [--org NAME] [--port N] [--dry-run]
#
# Creates the org's cross-repo GitHub App and sets the two org secrets that every
# cross-repo workflow reads. See .claude/reference/cross-repo-token.md for WHY an App
# rather than a PAT, and what each consumer uses it for.
#
# This was written down as a browser-only chore — "note the App ID, download the .pem,
# set two secrets by hand" — and then sat undone for long enough to block four
# workflows, which is the usual fate of a documented manual procedure. GitHub's App
# Manifest flow removes almost all of it: the manifest declares the name, permissions
# and webhook settings up front, and a code exchange returns the App ID and private
# key over the API. No transcribing an ID, no .pem sitting in ~/Downloads.
#
# Two clicks are irreducibly yours, and both are consent, which is the point:
#   1. "Create GitHub App" on a page this script pre-fills.
#   2. "Install" on the org.
# Everything either side of those is automated.
#
# The private key is never printed and never written inside the repo. It goes to a
# 0600 file in a temp dir, straight into the org secret, and is shredded on exit.

set -euo pipefail

ORG=""
PORT=8765
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)     ORG="$2"; shift 2 ;;
    --port)    PORT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

for dep in gh jq python3; do
  command -v "$dep" >/dev/null 2>&1 || { echo "Error: $dep is required." >&2; exit 1; }
done

if [[ -z "$ORG" ]]; then
  ORG=$(git -C "$ROOT" remote get-url origin 2>/dev/null \
    | sed -E 's#\.git$##; s#.*[:/]([^/]+)/[^/]+$#\1#')
fi
[[ -n "$ORG" ]] || { echo "Error: could not determine the org. Pass --org." >&2; exit 1; }

APP_NAME="${ORG} Cross-Repo Bot"
HOMEPAGE="https://github.com/${ORG}/focal-studio-app-template"
REDIRECT="http://127.0.0.1:${PORT}/callback"

echo "Org:  $ORG"
echo "App:  $APP_NAME"
echo

# ── Already provisioned? ──────────────────────────────────────────────────────
# Re-running this should be safe. If both secrets exist the App is already in place,
# and creating a second one would leave two Apps with the same name and one live
# secret pair — confusing in exactly the way a half-finished credential is.
existing=$(gh secret list --org "$ORG" --json name --jq '[.[].name]' 2>/dev/null || echo '[]')
if jq -e 'index("FOCALSTUDIO_BOT_APP_ID") and index("FOCALSTUDIO_BOT_PRIVATE_KEY")' >/dev/null <<< "$existing"; then
  echo "Both org secrets already exist:"
  gh secret list --org "$ORG" 2>/dev/null | grep FOCALSTUDIO_BOT || true
  echo
  echo "Nothing to do. To rotate the key instead, follow the rotation steps in"
  echo ".claude/reference/cross-repo-token.md — this script does not rotate."
  exit 0
fi

# ── The manifest ──────────────────────────────────────────────────────────────
# Permissions are the union the two consumers need, and no more:
#   publish-privacy.yml     contents:write, pull_requests:write   (Pages repo)
#   cross-repo-report.yml   contents:read,  issues:write          (the app repos)
# What bounds an individual run is create-github-app-token's `repositories:` input,
# not this list — see the reference doc.
#
# Webhooks are off: nothing listens, and an active webhook with no receiver produces
# a permanently failing delivery log that looks like a real problem.
MANIFEST=$(jq -nc \
  --arg name "$APP_NAME" \
  --arg url "$HOMEPAGE" \
  --arg redirect "$REDIRECT" \
  '{
     name: $name,
     url: $url,
     redirect_url: $redirect,
     public: false,
     hook_attributes: { url: "https://example.invalid/unused", active: false },
     default_permissions: {
       contents: "write",
       pull_requests: "write",
       issues: "write",
       metadata: "read"
     },
     default_events: []
   }')

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Manifest that would be submitted:"
  jq . <<< "$MANIFEST"
  echo
  echo "Would open: https://github.com/organizations/${ORG}/settings/apps/new"
  echo "Would then set FOCALSTUDIO_BOT_APP_ID and FOCALSTUDIO_BOT_PRIVATE_KEY on the org."
  exit 0
fi

# ── admin:org, checked before the browser dance rather than after ─────────────
# Finding out the token lacks a scope AFTER the App exists means the App is created,
# the one-time code is spent, and the private key is in a temp file that is about to
# be cleaned up. Check first.
if ! gh auth status 2>&1 | grep -q "admin:org"; then
  echo "Your gh token lacks the 'admin:org' scope, which setting an org secret needs."
  echo "Requesting it now — this opens a browser and returns here."
  echo
  gh auth refresh -h github.com -s admin:org
  gh auth status 2>&1 | grep -q "admin:org" || {
    echo "Error: still no admin:org scope. Re-run once it is granted." >&2; exit 1; }
fi

STATE=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')
WORK=$(mktemp -d)
cleanup() {
  # The private key lives here. Overwrite before unlinking: a plain delete leaves the
  # bytes on disk, and this is the one secret that cannot be re-fetched.
  if [[ -f "$WORK/key.pem" ]]; then
    dd if=/dev/urandom of="$WORK/key.pem" bs=1k count=8 conv=notrunc 2>/dev/null || true
  fi
  rm -f "$WORK"/* 2>/dev/null || true
  rmdir "$WORK" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting a local listener on 127.0.0.1:${PORT}..."
MANIFEST="$MANIFEST" STATE="$STATE" PORT="$PORT" ORG="$ORG" APP_NAME="$APP_NAME" \
  python3 "$SCRIPT_DIR/lib/app-manifest-server.py" "$WORK/code.txt" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; cleanup' EXIT
sleep 1

URL="http://127.0.0.1:${PORT}/"
echo
echo "─────────────────────────────────────────────────────────────────────"
echo " CLICK 1 of 2 — opening $URL"
echo
echo " The page forwards you to GitHub with the App already filled in."
echo " Review it and press 'Create GitHub App'. Nothing to type."
echo "─────────────────────────────────────────────────────────────────────"
echo
command -v open >/dev/null 2>&1 && open "$URL" || echo "Open $URL yourself."

# Wait for the callback, with a deadline — a hung wait with no explanation is worse
# than a timeout that says what it was waiting for.
waited=0
while [[ ! -s "$WORK/code.txt" ]]; do
  sleep 2; waited=$((waited + 2))
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Error: the local listener exited before GitHub called back." >&2; exit 1
  fi
  if [[ $waited -ge 300 ]]; then
    echo "Error: timed out after 5 minutes waiting for the GitHub redirect." >&2
    echo "       If you created the App anyway, the secrets can be set by hand —" >&2
    echo "       see .claude/reference/cross-repo-token.md." >&2
    exit 1
  fi
done
kill "$SERVER_PID" 2>/dev/null || true

CODE=$(cat "$WORK/code.txt")
[[ -n "$CODE" ]] || { echo "Error: empty code from GitHub." >&2; exit 1; }
echo "GitHub called back. Exchanging the one-time code..."

# The conversion endpoint is unauthenticated and single-use: the code is spent here.
CONV=$(gh api -X POST "app-manifests/${CODE}/conversions" 2>/dev/null) || {
  echo "Error: the code exchange failed. Codes expire in one hour and are single-use." >&2
  exit 1
}

APP_ID=$(jq -r '.id' <<< "$CONV")
APP_SLUG=$(jq -r '.slug' <<< "$CONV")
APP_HTML=$(jq -r '.html_url' <<< "$CONV")
jq -r '.pem' <<< "$CONV" > "$WORK/key.pem"
chmod 600 "$WORK/key.pem"

[[ "$APP_ID" != "null" && -n "$APP_ID" ]] || { echo "Error: no App ID in the response." >&2; exit 1; }
grep -q "BEGIN RSA PRIVATE KEY" "$WORK/key.pem" || { echo "Error: no private key in the response." >&2; exit 1; }

echo "  App created: $APP_HTML  (id $APP_ID)"
echo

echo "Setting org secrets (visibility: all repositories)..."
gh secret set FOCALSTUDIO_BOT_APP_ID      --org "$ORG" --visibility all --body "$APP_ID"
gh secret set FOCALSTUDIO_BOT_PRIVATE_KEY --org "$ORG" --visibility all < "$WORK/key.pem"
echo "  Both secrets set. The key has not been written anywhere else and is now shredded."
echo

INSTALL_URL="https://github.com/organizations/${ORG}/settings/apps/${APP_SLUG}/installations"
echo "─────────────────────────────────────────────────────────────────────"
echo " CLICK 2 of 2 — install the App on the org"
echo
echo "   $INSTALL_URL"
echo
echo " Choose 'All repositories'. Without this the App holds permissions but"
echo " is installed nowhere, and every workflow fails on token minting with an"
echo " error that does not mention installation."
echo "─────────────────────────────────────────────────────────────────────"
command -v open >/dev/null 2>&1 && open "$INSTALL_URL" || true
echo
echo "Then verify end to end:"
echo "  gh workflow run cross-repo-report.yml"
echo "  gh run watch"
echo
echo "It should now RUN rather than skip. A skip means the secrets are not visible;"
echo "a failure at 'Mint a scoped installation token' means step 2 was not completed."
