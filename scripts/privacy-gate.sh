#!/bin/bash
# Usage: bash scripts/privacy-gate.sh [ROOT]
#
# Decides whether the privacy-page workflows should do anything in this repo, and
# resolves the app slug and live URL if so. Shared by verify-privacy.yml (which then
# regenerates the page and curls the live URL) and publish-privacy.yml (which then
# opens a PR against the Pages repo).
#
# It lives in one file because of the host allowlist below: that regex bounds the
# runner to focalstudio.github.io, so a workflow that curls or pushes based on an
# edited PRIVACY_POLICY_URL cannot be turned into a probe of an arbitrary host. Two
# hand-synced copies of a security check is exactly the drift .github/shared-paths.json
# exists to fight.
#
# ROOT defaults to $PWD; pass a fixture directory to exercise the branches the
# template repo itself can never reach (it always skips at the first one).
#
# Outputs, appended to $GITHUB_OUTPUT when that is set and echoed either way:
#   run=true|false   whether the caller should proceed
#   slug=<app-slug>  parsed from APP_SLUG in src/constants.ts (only when run=true)
#   url=<live url>   parsed from PRIVACY_POLICY_URL (only when run=true)
#
# Exit status: 0 for both "proceed" and "skip" — skipping is a normal outcome in the
# un-bootstrapped template. Non-zero only for a repo that IS bootstrapped and has a
# URL that is missing, unparseable, or off the allowlist, which is a real misconfig.

set -euo pipefail

ROOT="${1:-$PWD}"

emit() {
  echo "$1"
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1" >> "$GITHUB_OUTPUT"
  return 0
}

skip() {
  echo "$1 Skipping."
  emit "run=false"
  exit 0
}

fail() {
  # ::error:: renders as an annotation in Actions and as plain text in a terminal.
  echo "::error::$1"
  exit 1
}

# Whitespace-tolerant so reformatting constants.ts (Prettier etc.) can't silently
# yield an empty URL.
URL=$(grep -oE 'PRIVACY_POLICY_URL[[:space:]]*=[[:space:]]*"[^"]*"' "$ROOT/src/constants.ts" 2>/dev/null \
  | sed -E 's/.*"([^"]*)"/\1/' || true)

if [ ! -f "$ROOT/store-listing/privacy.config.json" ]; then
  skip "No store-listing/privacy.config.json — this app does not use the privacy generator."
fi

if printf '%s' "$URL" | grep -q '\['; then
  skip "PRIVACY_POLICY_URL is still a placeholder ($URL) — template not bootstrapped."
fi

if [ -z "$URL" ]; then
  fail "Bootstrapped (privacy.config.json present) but PRIVACY_POLICY_URL could not be parsed from src/constants.ts."
fi

if ! printf '%s' "$URL" | grep -qE '^https://focalstudio\.github\.io/privacy-[a-z0-9-]+\.html$'; then
  fail "PRIVACY_POLICY_URL ($URL) must match https://focalstudio.github.io/privacy-<slug>.html."
fi

# Safe to derive from the URL rather than re-parsing constants.ts: gen-privacy-policy.mjs
# already refuses to run unless the URL tail equals privacy-<APP_SLUG>.html, so the two
# cannot disagree by the time anything downstream uses this.
SLUG=$(printf '%s' "$URL" | sed -E 's#.*/privacy-(.*)\.html$#\1#')

echo "Privacy gate: proceeding for slug '$SLUG' ($URL)"
emit "run=true"
emit "slug=$SLUG"
emit "url=$URL"
