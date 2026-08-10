#!/bin/bash
# Usage: bash scripts/drift-report.sh [--app owner/name] [--diff] [--path GLOB] [--no-fetch]
#
# Reports drift across the template <-> generated-app boundary defined in
# .github/shared-paths.json. Read-only: it prints, it never writes to another repo
# and never edits a file here.
#
# Runs in either direction, chosen automatically:
#
#   From the template  compares this checkout against every app in the manifest's
#                      `apps` list (or just one, with --app).
#   From a generated   compares this checkout against the upstream template. Works
#   app                with no gh auth at all, since the template is public.
#
# Why this exists: #145. Four fixes failed to travel between these repos, three of
# them app -> template, and every one was caught by a person happening to remember.
# The direction with no mechanism is the common one, because the template cannot run
# its own E2E suite — maestro-e2e.yml skips at the [APP_SLUG] gate — so every runtime
# defect in .maestro/*.yaml is found downstream by construction.
#
#   --app owner/name  restrict to one app (template direction only)
#   --path GLOB       restrict to shared paths matching GLOB
#   --diff            print full diffs for content drift, not just the file list
#   --no-fetch        use the cached clones as-is; no network for the app side
#
# Exit status is 0 whether or not drift was found. This is a report, not a gate. A
# gate on a boundary this soft gets switched off within a week, and the whole point
# is that someone still reads it.

set -euo pipefail

APP_FILTER=""
PATH_FILTER=""
SHOW_DIFF=false
FETCH=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)       APP_FILTER="$2";  shift 2 ;;
    --path)      PATH_FILTER="$2"; shift 2 ;;
    --diff)      SHOW_DIFF=true;   shift ;;
    --no-fetch)  FETCH=false;      shift ;;
    -h|--help)   sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$ROOT/.github/shared-paths.json"
CACHE="$ROOT/.claude/scratch/drift"

for dep in jq git; do
  command -v "$dep" >/dev/null 2>&1 || { echo "Error: $dep is required." >&2; exit 1; }
done

if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: manifest not found at $MANIFEST" >&2
  exit 1
fi

UPSTREAM=$(jq -r '.upstream' "$MANIFEST")
UPSTREAM_BRANCH=$(jq -r '.upstreamBranch' "$MANIFEST")

# ── Direction ────────────────────────────────────────────────────────────────
# The template still carries its own placeholders; scripts/init.sh replaces them
# in a generated app. Same tell app.json gives maestro-e2e.yml's bootstrap gate.
if grep -q '\[APP_NAME\]' "$ROOT/app.json" 2>/dev/null; then
  DIRECTION="template"
else
  DIRECTION="app"
fi

# ── Pattern matching ─────────────────────────────────────────────────────────
# ONE semantic everywhere: bash `[[ == ]]`, where `*` also matches `/`. Deliberately
# not git pathspec globs, whose `*` stops at a slash — running two glob dialects over
# one manifest is how an `exclude` silently stops excluding.
matches_any() {
  local p="$1"; shift
  local g
  for g in "$@"; do
    # shellcheck disable=SC2053
    [[ "$p" == $g ]] && return 0
  done
  return 1
}

# ── Normalisation ────────────────────────────────────────────────────────────
# Without this every single file reads as drifted. Two sources of false positives:
# the [APP_*] placeholders init.sh rewrites, and a missing trailing newline. 51 of
# the 56 shared files compared against tick differ by nothing else.
normalise() {
  sed -E 's/\[APP_NAME\]|\[APP_SLUG\]|\[GITHUB_REPO\]/@@PLACEHOLDER@@/g' "$1" \
    | sed -e '$a\'
}

# ── Clone cache ──────────────────────────────────────────────────────────────
# .claude/scratch/ is already gitignored. Clones are reused rather than recreated,
# which keeps repeat runs quick and means this script never has to delete anything.
sync_clone() {
  local repo="$1" branch="$2" dir="$3"
  if [[ -d "$dir/.git" ]]; then
    if [[ "$FETCH" == "true" ]]; then
      git -C "$dir" fetch --quiet --depth 500 origin "$branch" 2>/dev/null || return 1
      git -C "$dir" reset --quiet --hard "origin/$branch" 2>/dev/null || return 1
      # `reset --hard` leaves untracked files behind, and a stray file in the cache
      # reads as "the app has this" — which silently suppresses a real MISSING
      # result. The cache is wholly owned by this script, so cleaning it is safe.
      git -C "$dir" clean --quiet -fd 2>/dev/null || true
    fi
  else
    mkdir -p "$(dirname "$dir")"
    git clone --quiet --filter=blob:none --depth 500 --single-branch \
      --branch "$branch" "https://github.com/${repo}.git" "$dir" 2>/dev/null || return 1
  fi
  return 0
}

# ── Rules ────────────────────────────────────────────────────────────────────
# Loaded once into bash arrays rather than looked up with jq per file: it keeps the
# glob dialect the same as matches_any() above (a jq regex translation would be a
# second, subtly different one) and avoids forking jq several hundred times per app.
RULE_GLOB=(); RULE_MODE=(); RULE_EXCL=()
while IFS=$'\t' read -r g m e; do
  RULE_GLOB+=("$g"); RULE_MODE+=("$m"); RULE_EXCL+=("$e")
done <<< "$(jq -r '.paths[] | [.glob, .mode, ((.exclude // []) | join("|"))] | @tsv' "$MANIFEST")"

# Sets RULE_MODE_OUT for a path; returns 1 if the path is not shared (or is excluded).
rule_for() {
  local p="$1" i
  for i in "${!RULE_GLOB[@]}"; do
    # shellcheck disable=SC2053
    if [[ "$p" == ${RULE_GLOB[$i]} ]]; then
      if [[ -n "${RULE_EXCL[$i]}" ]]; then
        local -a ex=(); IFS='|' read -r -a ex <<< "${RULE_EXCL[$i]}"
        matches_any "$p" "${ex[@]}" && return 1
      fi
      RULE_MODE_OUT="${RULE_MODE[$i]}"
      return 0
    fi
  done
  return 1
}

# ── One comparison ───────────────────────────────────────────────────────────
# LEFT is always this checkout, RIGHT the other repo. The labels flip with direction
# so "missing in app" always means the same thing regardless of where you ran it.
compare() {
  local right_dir="$1" right_name="$2" scope="$3" skip_json="$4"

  # ── Fork point ──────────────────────────────────────────────────────────────
  # Everything in the template older than the app's bootstrap commit is ALREADY in
  # the app — it arrived with the copy. Listing it as "only here" buries the one
  # line that matters: unbounded, tick's full-journey.yaml reported 11 commits, of
  # which exactly 1 was an unpropagated fix. The bootstrap commit is scripts/init.sh's
  # own, `chore: initialise <Name> from focal-studio-app-template`.
  local app_dir bootstrap_date
  if [[ "$DIRECTION" == "template" ]]; then app_dir="$right_dir"; else app_dir="$ROOT"; fi
  # `|| true` on both: a repo that predates init.sh (WildFocus, vestia — transferred
  # in rather than generated) has no such commit, and under `set -o pipefail` the
  # empty grep would take the whole run down before the later apps are reached.
  bootstrap_date=$(git -C "$app_dir" log --format='%aI%x09%s' 2>/dev/null \
    | grep -i 'from focal-studio-app-template' | tail -1 | cut -f1 || true)
  if [[ -z "$bootstrap_date" ]]; then
    # Pre-init.sh app, or history deeper than the clone. Fall back to the oldest
    # commit we actually have, which over-reports rather than hiding anything.
    bootstrap_date=$(git -C "$app_dir" log --reverse --format='%aI' 2>/dev/null | head -1 || true)
  fi
  [[ -z "$bootstrap_date" ]] && bootstrap_date="1970-01-01T00:00:00Z"

  local -a SKIP=()
  if [[ -n "$skip_json" && "$skip_json" != "null" ]]; then
    while IFS= read -r line; do [[ -n "$line" ]] && SKIP+=("$line"); done \
      <<< "$(jq -r '.[]' <<< "$skip_json")"
  fi

  local -a LIMITED=()
  while IFS= read -r line; do [[ -n "$line" ]] && LIMITED+=("$line"); done \
    <<< "$(jq -r '.limitedScope[]' "$MANIFEST")"

  local missing_right=() missing_left=() content=() history=()

  # Union of both sides: a file the other repo has and we do not is drift too —
  # that is exactly how .claude/hooks/wrap-reminder.sh sat in MealCart for months.
  local all_files
  all_files=$( { git -C "$ROOT" ls-files; git -C "$right_dir" ls-files; } | sort -u )

  local f mode
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue

    rule_for "$f" || continue
    mode="$RULE_MODE_OUT"

    [[ "$scope" == "limited" ]] && { matches_any "$f" "${LIMITED[@]}" || continue; }
    [[ ${#SKIP[@]} -gt 0 ]] && matches_any "$f" "${SKIP[@]}" && continue
    [[ -n "$PATH_FILTER" && ! "$f" == $PATH_FILTER ]] && continue

    local in_left=false in_right=false
    [[ -f "$ROOT/$f" ]] && in_left=true
    [[ -f "$right_dir/$f" ]] && in_right=true

    if $in_left && ! $in_right; then missing_right+=("$f"); continue; fi
    if $in_right && ! $in_left; then missing_left+=("$f"); continue; fi
    $in_left || continue

    if [[ "$mode" == "advisory" ]]; then
      # Compare commit subjects, not bytes. An advisory file is shared in shape and
      # legitimately carries app-specific prose, so a content diff cannot separate
      # "this app renamed a screen in a comment" from "this app fixed a real bug" —
      # tick's full-journey.yaml differed by 59 lines, 58 of them correct.
      # --no-merges: "Merge remote-tracking branch 'origin/dev'" says nothing about
      # the file and appears on one side by construction.
      # --since the fork point on BOTH sides, and drop the bootstrap commit itself.
      local l_log r_log only_r only_l
      l_log=$(git -C "$ROOT" log --no-merges --since="$bootstrap_date" --format='%s' -- "$f" 2>/dev/null || true)
      r_log=$(git -C "$right_dir" log --no-merges --since="$bootstrap_date" --format='%s' -- "$f" 2>/dev/null \
        | grep -iv 'from focal-studio-app-template' || true)
      only_r=$(comm -13 <(sort -u <<< "$l_log") <(sort -u <<< "$r_log") | grep -v '^$' || true)
      only_l=$(comm -23 <(sort -u <<< "$l_log") <(sort -u <<< "$r_log") | grep -v '^$' || true)
      if [[ -n "$only_r" || -n "$only_l" ]]; then
        history+=("$f")
        HISTORY_DETAIL+=$'\n'"  $f"
        # awk, not sed: $right_name is owner/name and the slash would close a
        # `s///` expression early. HIST_CAP keeps one heavily-diverged file (an
        # app's own .claude/CLAUDE.md is the usual one) from burying the rest.
        [[ -n "$only_r" ]] && HISTORY_DETAIL+="$(_capped "$only_r" "      only in $right_name: ")"
        [[ -n "$only_l" ]] && HISTORY_DETAIL+="$(_capped "$only_l" "      only here: ")"
      fi
      continue
    fi

    if ! diff -q <(normalise "$ROOT/$f") <(normalise "$right_dir/$f") >/dev/null 2>&1; then
      content+=("$f")
      if [[ "$SHOW_DIFF" == "true" ]]; then
        DIFF_DETAIL+=$'\n'"--- $f"$'\n'"$(diff <(normalise "$ROOT/$f") <(normalise "$right_dir/$f") || true)"
      fi
    fi
  done <<< "$all_files"

  # Both labels flip with the direction, and BOTH must — naming only the first one
  # per direction is how "the template has this and the app does not" ends up
  # printed as "new in app".
  #
  # The one-sided-file categories are candidates, not defects. An app is entitled to
  # add its own script under a shared directory (MealCart's build-nutrition-index.js)
  # and that reads identically to MealCart's wrap-reminder.sh, which sat unpropagated
  # for months and is the whole reason #145 exists. Nothing can tell those apart
  # mechanically, so both are listed and a human spends a second on each; record the
  # verdict in that app's `skip` array so the next run is quieter.
  #
  # No ${var^^} anywhere in this script: /bin/bash on macOS is 3.2, which predates it.
  local lbl_ours lbl_theirs
  if [[ "$DIRECTION" == "template" ]]; then
    lbl_ours="MISSING IN APP ($right_name has never had these)"
    lbl_theirs="NEW IN APP (in $right_name, not in the template — backport candidate, or app-specific)"
  else
    lbl_ours="NEW HERE (in this app, not in the template — backport candidate, or app-specific)"
    lbl_theirs="NOT ADOPTED (the template has these, this app does not)"
  fi

  echo
  echo "══ $right_name  ($scope scope)"
  _section "$lbl_ours" "${missing_right[@]:-}"
  _section "$lbl_theirs" "${missing_left[@]:-}"
  _section "CONTENT DRIFT (must be identical, is not)" "${content[@]:-}"

  if [[ ${#history[@]} -gt 0 ]]; then
    echo "  HISTORY DIVERGED (shared shape, compared by commit subject):$HISTORY_DETAIL"
  fi
  HISTORY_DETAIL=""

  if [[ ${#missing_right[@]} -eq 0 && ${#missing_left[@]} -eq 0 \
        && ${#content[@]} -eq 0 && ${#history[@]} -eq 0 ]]; then
    echo "  No drift."
  fi

  TOTAL=$(( TOTAL + ${#missing_right[@]} + ${#missing_left[@]} + ${#content[@]} + ${#history[@]} ))
}

HIST_CAP=6

_capped() {
  local body="$1" prefix="$2" n
  n=$(grep -c '' <<< "$body")
  printf '\n%s' "$(awk -v p="$prefix" "NR<=$HIST_CAP {print p \$0}" <<< "$body")"
  [[ "$n" -gt "$HIST_CAP" ]] && printf '\n%s' "${prefix%%:*}: … and $((n - HIST_CAP)) more"
  return 0
}

_section() {
  local title="$1"; shift
  local items=("$@")
  [[ ${#items[@]} -eq 0 || -z "${items[0]}" ]] && return 0
  echo "  $title:"
  printf '      %s\n' "${items[@]}"
}

# ── Run ──────────────────────────────────────────────────────────────────────
TOTAL=0
HISTORY_DETAIL=""
DIFF_DETAIL=""

if [[ "$DIRECTION" == "template" ]]; then
  echo "Drift report — template ($UPSTREAM) vs generated apps"
  echo "Manifest: .github/shared-paths.json"

  while IFS= read -r app; do
    repo=$(jq -r '.repo' <<< "$app")
    [[ -n "$APP_FILTER" && "$repo" != "$APP_FILTER" ]] && continue
    branch=$(jq -r '.branch' <<< "$app")
    scope=$(jq -r '.scope' <<< "$app")
    skip=$(jq -c '.skip // []' <<< "$app")
    dir="$CACHE/${repo##*/}"

    if ! sync_clone "$repo" "$branch" "$dir"; then
      echo
      echo "══ $repo"
      echo "  ⚠️  Could not fetch $repo@$branch — check gh auth / repo access, or pass --no-fetch."
      continue
    fi
    compare "$dir" "$repo" "$scope" "$skip"
  done <<< "$(jq -c '.apps[]' "$MANIFEST")"

  if [[ -n "$APP_FILTER" && $TOTAL -eq 0 ]]; then
    jq -e --arg r "$APP_FILTER" '.apps[] | select(.repo == $r)' "$MANIFEST" >/dev/null \
      || echo "  ⚠️  $APP_FILTER is not in the manifest's apps list."
  fi
else
  echo "Drift report — this app vs the template ($UPSTREAM)"
  echo "Manifest: .github/shared-paths.json"
  dir="$CACHE/template"
  if ! sync_clone "$UPSTREAM" "$UPSTREAM_BRANCH" "$dir"; then
    echo "  ⚠️  Could not fetch $UPSTREAM@$UPSTREAM_BRANCH."
    exit 0
  fi
  compare "$dir" "$UPSTREAM" "full" "[]"
fi

if [[ "$SHOW_DIFF" == "true" && -n "$DIFF_DETAIL" ]]; then
  echo
  echo "══ Diffs$DIFF_DETAIL"
fi

echo
if [[ $TOTAL -eq 0 ]]; then
  echo "Clean — nothing in the shared surface has drifted."
else
  echo "$TOTAL drifted path(s). Nothing was changed — decide per path whether the fix"
  echo "needs to travel, and open an issue on the side that is behind."
fi
