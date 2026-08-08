#!/bin/bash
# Usage: bash scripts/sync-labels.sh [--repo owner/name] [--dry-run]
#
# Applies .github/labels.tsv to a GitHub repo. Idempotent: `gh label create --force`
# creates a missing label and updates the color/description of an existing one, so
# re-running is a no-op once the repo matches the manifest.
#
# scripts/init.sh calls this during bootstrap. Run it by hand on an app generated
# before this existed (#127) — it only had 4 of the 18 labels, which made the issue
# convention in .claude/reference/issue-labels.md unfollowable and the `e2e` opt-in
# in .github/workflows/maestro-e2e.yml impossible to apply.
#
# --repo defaults to the repo of the current checkout.
# --dry-run prints what would be applied and touches nothing (needs no gh auth).

set -e

REPO=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)     REPO="$2";    shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    -h|--help)  sed -n '2,15p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/../.github/labels.tsv"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: label manifest not found at $MANIFEST"
  exit 1
fi

if [[ "$DRY_RUN" == "false" ]]; then
  if ! command -v gh &>/dev/null; then
    echo "Error: gh CLI not found — install it, or create the labels in $MANIFEST by hand."
    exit 1
  fi
  if [[ -z "$REPO" ]]; then
    REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
    if [[ -z "$REPO" ]]; then
      echo "Error: could not resolve the current repo — pass --repo owner/name."
      exit 1
    fi
  fi
  echo "Syncing labels from .github/labels.tsv to $REPO..."
else
  echo "Dry run — would sync these labels to ${REPO:-<current repo>}:"
fi

APPLIED=0
FAILED=0

# IFS=$'\t' keeps multi-word names intact ("good first issue"); the read strips
# nothing else, so descriptions keep their spaces and punctuation.
while IFS=$'\t' read -r NAME COLOR DESCRIPTION; do
  [[ -z "$NAME" || "$NAME" == \#* ]] && continue

  if [[ -z "$COLOR" || -z "$DESCRIPTION" ]]; then
    echo "  ⚠️  Skipping malformed row (expected 3 tab-separated fields): $NAME"
    FAILED=$((FAILED+1))
    continue
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  %-18s #%s  %s\n' "$NAME" "$COLOR" "$DESCRIPTION"
    APPLIED=$((APPLIED+1))
    continue
  fi

  if gh label create "$NAME" --color "$COLOR" --description "$DESCRIPTION" \
       --force --repo "$REPO" >/dev/null 2>&1; then
    APPLIED=$((APPLIED+1))
  else
    echo "  ⚠️  Could not apply label: $NAME"
    FAILED=$((FAILED+1))
  fi
done < "$MANIFEST"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "$APPLIED label(s) in manifest."
else
  echo "  $APPLIED label(s) applied."
fi

if [[ $FAILED -gt 0 ]]; then
  echo "  ⚠️  $FAILED label(s) failed — check gh auth and repo permissions, then re-run."
  exit 1
fi
