#!/bin/bash
# Usage: bash scripts/fleet-report.sh [--repo NAME] [--releases N] [--json] [--html [--out PATH]] [--write] [--all]
#
# One-screen inventory of every repo in the GitHub org this checkout belongs to:
# what database each app uses, what its last release was, and what is in flight.
# Read-only — it queries the GitHub API and prints. It never writes to a remote,
# and writes locally only under .claude/scratch/ when you pass --write.
#
# Why this exists: the fleet is spread over separate repos, and answering "what is
# the state of everything" meant opening each one by hand. Nothing here is a
# hand-maintained inventory: the repo list comes from `gh repo list`, so a new app
# appears the moment it is created and there is no manifest to keep in sync.
#
# Deliberately NOT committed output. This template repo is public and most app
# repos are private; versions, release notes and issue titles are the sensitive
# part, so --write targets the gitignored scratch dir.
#
#   --repo NAME       one repo only
#   --releases N      show the last N releases with their notes (default 1)
#   --json            machine-readable; the seam a scheduled/Pages consumer would use
#   --html            render the same data to a self-contained page and print its path
#                     (default ~/.focalstudio/fleet.html — outside the repo on purpose)
#   --out PATH        where --html writes
#   --write           also write .claude/scratch/fleet-YYYYMMDD-HHMM.md
#   --all             include archived repos
#
# Exit status is 0 whether or not anything looks wrong. This is a report, not a
# gate — same call as scripts/drift-report.sh, for the same reason.
#
# No `${var^^}` and no associative arrays anywhere: /bin/bash on macOS is 3.2.

set -euo pipefail

# ── Failure stage ────────────────────────────────────────────────────────────
# Same seam as scripts/drift-report.sh: on a non-zero exit, one line with a fixed stage
# name and never an error message. cross-repo-report.yml copies it to a public page
# after checking it against this exact format. Probes run in background subshells, so
# a single probe dying never reaches here. It shows up as an omitted repo instead.
STAGE="setup"
TMP=""
_on_exit() {
  local rc="$1"
  [[ -n "$TMP" ]] && rm -rf "$TMP"
  [[ "$rc" -ne 0 ]] && echo "fleet-report.sh: failed at stage: $STAGE (exit $rc)" >&2
  return "$rc"
}
trap '_on_exit $?' EXIT

REPO_FILTER=""
RELEASES=1
AS_JSON=false
AS_HTML=false
HTML_OUT=""
WRITE=false
INCLUDE_ARCHIVED=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)     REPO_FILTER="$2"; shift 2 ;;
    --releases) RELEASES="$2";    shift 2 ;;
    --json)     AS_JSON=true;     shift ;;
    --html)     AS_HTML=true;     shift ;;
    --out)      HTML_OUT="$2";    shift 2 ;;
    --write)    WRITE=true;       shift ;;
    --all)      INCLUDE_ARCHIVED=true; shift ;;
    -h|--help)  sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$ROOT/.github/shared-paths.json"

STAGE="preflight"
for dep in gh jq; do
  command -v "$dep" >/dev/null 2>&1 || { echo "Error: $dep is required." >&2; exit 1; }
done

STAGE="auth"
if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run 'gh auth login' — private repos in the" >&2
  echo "       fleet are unreadable without it." >&2
  exit 1
fi

# ── Org discovery ────────────────────────────────────────────────────────────
# Derived from the remote, so this works unchanged from inside any generated app.
ORG="${ORG:-}"
if [[ -z "$ORG" ]]; then
  origin=$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)
  ORG=$(sed -E 's#\.git$##; s#.*[:/]([^/]+)/[^/]+$#\1#' <<< "$origin")
fi
if [[ -z "$ORG" ]]; then
  echo "Error: could not determine the org from 'git remote get-url origin'." >&2
  echo "       Set it explicitly: ORG=myorg bash scripts/fleet-report.sh" >&2
  exit 1
fi

TMP=$(mktemp -d)

# ── Helpers ──────────────────────────────────────────────────────────────────
# Every probe is allowed to fail. A 404 is information (no releases yet, no
# ROADMAP.md), not an error, so the caller gets an empty string and decides.
_api() { gh api "$1" 2>/dev/null || true; }
# On a 404 gh prints the JSON error body to STDOUT and the human message to stderr,
# so `|| true` alone hands the caller {"message":"Not Found",...} as if it were file
# content. That body is valid JSON, so it survived the package.json parse check and
# every repo without a package.json was read from an error document — which is how
# the Pages site reported a Node stack instead of being a static site. Swallow the
# body when the request failed, so absent reads as absent.
_raw() {
  local body status
  body=$(gh api "$1" -H "Accept: application/vnd.github.raw" 2>/dev/null); status=$?
  [[ $status -ne 0 ]] && return 0
  printf '%s' "$body"
}

# Days since an ISO-8601 timestamp. BSD date on macOS, GNU date in CI.
_days_since() {
  local iso="$1" then now
  [[ -z "$iso" || "$iso" == "null" ]] && { echo ""; return 0; }
  then=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null \
      || date -d "$iso" +%s 2>/dev/null || echo "")
  [[ -z "$then" ]] && { echo ""; return 0; }
  now=$(date +%s)
  echo $(( (now - then) / 86400 ))
}

# The bar arithmetic is lifted from .claude/commands/standup.md so that one app's
# bar means the same thing in /standup and here. 20 chars, filled = round(pct/5).
_bar() {
  local percent="$1" filled i out=""
  filled=$(( (percent * 20 + 50) / 100 ))
  for (( i = 0; i < 20; i++ )); do
    if [[ $i -lt $filled ]]; then out="$out="; else out="$out."; fi
  done
  echo "$out"
}

# ── Probe one repo ───────────────────────────────────────────────────────────
probe_repo() {
  local name="$1" private="$2" default_branch="$3" out="$TMP/$name.json"

  # has_pages is not exposed by `gh repo list`, so it comes from the repo object.
  local has_pages
  has_pages=$(_api "repos/$ORG/$name" | jq -r '.has_pages // false' 2>/dev/null || echo false)

  local pkg deps version expo rn react
  pkg=$(_raw "repos/$ORG/$name/contents/package.json")
  if ! jq -e . >/dev/null 2>&1 <<< "$pkg"; then pkg='{}'; fi
  # devDependencies too: vite and vitest live there, and a build tool is as much a
  # part of "what is this repo" as a runtime dependency.
  deps=$(jq -r '[((.dependencies // {}) + (.devDependencies // {})) | keys[]] | join(" ")' <<< "$pkg")
  version=$(jq -r '.version // ""' <<< "$pkg")
  expo=$(jq -r '.dependencies.expo // ""' <<< "$pkg")
  rn=$(jq -r '.dependencies["react-native"] // ""' <<< "$pkg")
  react=$(jq -r '.dependencies.react // ""' <<< "$pkg")

  # ── Framework ───────────────────────────────────────────────────────────────
  # An "Expo version" column reads as blank for every repo that is not Expo, which
  # is how WildFocus (Capacitor + Vite) and the Pages site showed up as having no
  # stack at all. The question is really "what is this repo built with", so the
  # answer is a name and a version, and the dashboard compares versions only within
  # a framework — an Expo app being on a different major than a Vite app is not drift.
  _dep_ver() { jq -r --arg k "$1" '((.dependencies // {}) + (.devDependencies // {}))[$k] // ""' <<< "$pkg"; }
  local fw_name="" fw_version="" fw_secondary=""
  if [[ -n "$expo" ]]; then
    fw_name="Expo";      fw_version="$expo"
    [[ -n "$rn" ]] && fw_secondary="React Native $rn"
  elif [[ -n "$(_dep_ver '@capacitor/core')" ]]; then
    fw_name="Capacitor"; fw_version="$(_dep_ver '@capacitor/core')"
    [[ -n "$(_dep_ver vite)" ]] && fw_secondary="Vite $(_dep_ver vite)"
  elif [[ -n "$(_dep_ver next)" ]]; then
    fw_name="Next.js";   fw_version="$(_dep_ver next)"
  elif [[ -n "$(_dep_ver vite)" ]]; then
    fw_name="Vite";      fw_version="$(_dep_ver vite)"
    [[ -n "$react" ]] && fw_secondary="React $react"
  elif [[ "$pkg" == "{}" ]]; then
    # No package.json at all. For the Pages repo that is the correct answer rather
    # than a gap: it is hand-written HTML with no build step.
    fw_name="static";    fw_version=""
  else
    fw_name="Node";      fw_version=""
  fi

  _has_dep() { grep -qE "(^| )$1( |$)" <<< "$deps"; }

  # env.js is the app's own declaration; dependencies are inference. Where both
  # exist they should agree, and a disagreement is itself worth seeing — so the
  # declaration wins and the evidence string says which one spoke.
  local envjs backend_decl paywall_decl
  envjs=$(_raw "repos/$ORG/$name/contents/env.js")
  backend_decl=$(sed -nE 's/^const BACKEND = "([^"]*)".*/\1/p' <<< "$envjs" | head -1)
  paywall_decl=$(sed -nE 's/^const PAYWALL = "([^"]*)".*/\1/p' <<< "$envjs" | head -1)

  local db_verdict db_evidence
  if [[ -n "$backend_decl" && "$backend_decl" != "none" ]]; then
    db_verdict="$backend_decl"; db_evidence="env.js declares BACKEND"
  elif _has_dep "@supabase/supabase-js"; then
    db_verdict="Supabase (Postgres)"; db_evidence="dep @supabase/supabase-js"
  elif _has_dep "firebase" || _has_dep "firebase-admin"; then
    db_verdict="Firebase (Firestore)"; db_evidence="dep firebase"
  elif _has_dep "expo-sqlite"; then
    db_verdict="SQLite (on-device)"; db_evidence="dep expo-sqlite"
  elif _has_dep "@react-native-async-storage/async-storage"; then
    db_verdict="AsyncStorage (local, no DB)"
    if [[ "$backend_decl" == "none" ]]; then
      db_evidence="env.js declares BACKEND=none; dep async-storage"
    else
      db_evidence="dep async-storage, nothing remote"
    fi
  elif [[ "$backend_decl" == "none" ]]; then
    db_verdict="none"; db_evidence="env.js declares BACKEND=none"
  else
    db_verdict="none detected"; db_evidence=""
  fi

  local paywall paywall_ev="" analytics analytics_ev=""
  if [[ -n "$paywall_decl" && "$paywall_decl" != "none" ]]; then
    paywall="$paywall_decl"; paywall_ev="env.js declares PAYWALL"
  elif _has_dep "react-native-purchases"; then
    paywall="RevenueCat"; paywall_ev="dep react-native-purchases"
  else paywall="none"; fi
  if _has_dep "posthog-react-native"; then analytics="PostHog"; analytics_ev="dep posthog-react-native"
  elif _has_dep "posthog-js"; then analytics="PostHog"; analytics_ev="dep posthog-js"
  else analytics="none"; fi

  # Kind: keeps the Pages site from being judged against app-only expectations.
  local kind upstream_name=""
  [[ -f "$MANIFEST" ]] && upstream_name=$(jq -r '.upstream // ""' "$MANIFEST" | sed 's#.*/##')
  if [[ -n "$upstream_name" && "$name" == "$upstream_name" ]]; then kind="template"
  elif _has_dep "expo" || _has_dep "react-native" || _has_dep "@capacitor/core"; then kind="app"
  elif [[ "$has_pages" == "true" ]]; then kind="site"
  else kind="other"; fi

  local scope=""
  if [[ -f "$MANIFEST" ]]; then
    scope=$(jq -r --arg r "$ORG/$name" '(.apps // []) | map(select(.repo == $r)) | .[0].scope // ""' "$MANIFEST")
  fi

  # Releases
  local rel_json tag pub age unreleased="" notes=""
  rel_json=$(_api "repos/$ORG/$name/releases/latest")
  if ! jq -e .tag_name >/dev/null 2>&1 <<< "$rel_json"; then rel_json='{}'; fi
  tag=$(jq -r '.tag_name // ""' <<< "$rel_json")
  pub=$(jq -r '.published_at // ""' <<< "$rel_json")
  age=$(_days_since "$pub")
  notes=$(jq -r '.body // ""' <<< "$rel_json" \
        | grep -vE '^\s*$|^\s*#' | head -3 | cut -c1-96 | sed 's/^/> /' || true)

  if [[ -n "$tag" && -n "$default_branch" ]]; then
    unreleased=$(_api "repos/$ORG/$name/compare/$tag...$default_branch" | jq -r '.ahead_by // ""')
  fi

  local rel_list='[]'
  if [[ "$RELEASES" -gt 1 ]]; then
    rel_list=$(_api "repos/$ORG/$name/releases?per_page=$RELEASES" \
      | jq '[.[]? | {tag: .tag_name, date: (.published_at // "" | split("T")[0]),
                     body: ((.body // "") | split("\n")
                            | map(select(test("^\\s*$|^\\s*#") | not))
                            | .[0] // "")}]' 2>/dev/null || echo '[]')
  fi

  # dev vs the default branch — the "work sitting unmerged" signal
  local dev_ahead="" dev_behind="" cmp
  if [[ "$default_branch" != "dev" ]]; then
    cmp=$(_api "repos/$ORG/$name/compare/$default_branch...dev")
    dev_ahead=$(jq -r '.ahead_by // ""' <<< "$cmp" 2>/dev/null || echo "")
    dev_behind=$(jq -r '.behind_by // ""' <<< "$cmp" 2>/dev/null || echo "")
  fi

  local ci ci_name ci_concl ci_date
  ci=$(_api "repos/$ORG/$name/actions/runs?per_page=1&branch=$default_branch")
  ci_name=$(jq -r '.workflow_runs[0].name // ""' <<< "$ci" 2>/dev/null || echo "")
  ci_concl=$(jq -r '.workflow_runs[0].conclusion // ""' <<< "$ci" 2>/dev/null || echo "")
  ci_date=$(jq -r '.workflow_runs[0].updated_at // "" | split("T")[0]' <<< "$ci" 2>/dev/null || echo "")

  local prs pr_titles issues issues_hot
  prs=$(_api "repos/$ORG/$name/pulls?state=open&per_page=100")
  pr_titles=$(jq '[.[]? | .title]' <<< "$prs" 2>/dev/null || echo '[]')
  local pr_count
  pr_count=$(jq 'length' <<< "$pr_titles" 2>/dev/null || echo 0)
  issues=$(_api "repos/$ORG/$name/issues?state=open&per_page=100")
  local issue_count
  issue_count=$(jq '[.[]? | select(.pull_request == null)] | length' <<< "$issues" 2>/dev/null || echo 0)
  issues_hot=$(jq '[.[]? | select(.pull_request == null)
                   | select([.labels[]?.name] | any(. == "critical" or . == "high"))] | length' \
                 <<< "$issues" 2>/dev/null || echo 0)

  # Which template release this repo last adopted. Absent for anything not generated
  # from the template (WildFocus, vestia) and for apps bootstrapped before the file
  # existed — absent and behind are different facts, so a missing file stays null
  # rather than reading as 0.0.0.
  local template_version
  template_version=$(_raw "repos/$ORG/$name/contents/TEMPLATE_VERSION?ref=$default_branch" | tr -d '[:space:]')
  [[ ! "$template_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && template_version=""

  # Roadmap. Absent and zero are different facts, so a missing file stays null.
  local roadmap done_n total_n percent="" roadmap_ref="$default_branch"
  roadmap=$(_raw "repos/$ORG/$name/contents/ROADMAP.md?ref=dev")
  if [[ -n "$roadmap" ]] && grep -q '^- \[[ x]\]' <<< "$roadmap" 2>/dev/null; then
    roadmap_ref="dev"
  else
    roadmap=$(_raw "repos/$ORG/$name/contents/ROADMAP.md")
  fi
  if grep -q '^- \[[ x]\]' <<< "$roadmap" 2>/dev/null; then
    done_n=$(grep -c '^- \[x\]' <<< "$roadmap" || true)
    total_n=$(grep -c '^- \[[ x]\]' <<< "$roadmap" || true)
    [[ "$total_n" -gt 0 ]] && percent=$(( (done_n * 100 + total_n / 2) / total_n ))
  else
    done_n=""; total_n=""
  fi

  jq -n \
    --arg name "$name" --arg kind "$kind" --arg scope "$scope" \
    --argjson private "$private" --arg default_branch "$default_branch" \
    --arg version "$version" \
    --arg db "$db_verdict" --arg db_ev "$db_evidence" \
    --arg paywall "$paywall" --arg paywall_ev "$paywall_ev" \
    --arg analytics "$analytics" --arg analytics_ev "$analytics_ev" \
    --arg expo "$expo" --arg rn "$rn" --arg react "$react" \
    --arg fw_name "$fw_name" --arg fw_version "$fw_version" --arg fw_secondary "$fw_secondary" \
    --arg tag "$tag" --arg pub "$pub" --arg age "$age" \
    --arg unreleased "$unreleased" --arg notes "$notes" --argjson releases "$rel_list" \
    --arg dev_ahead "$dev_ahead" --arg dev_behind "$dev_behind" \
    --arg ci_name "$ci_name" --arg ci_concl "$ci_concl" --arg ci_date "$ci_date" \
    --argjson pr_count "${pr_count:-0}" --argjson pr_titles "$pr_titles" \
    --argjson issues "${issue_count:-0}" --argjson issues_hot "${issues_hot:-0}" \
    --arg done_n "$done_n" --arg total_n "$total_n" --arg percent "$percent" \
    --arg roadmap_ref "$roadmap_ref" \
    --arg template_version "$template_version" \
    '{
      name: $name, kind: $kind, private: $private,
      scope: (if $scope == "" then null else $scope end),
      default_branch: $default_branch,
      version: $version,
      template_version: (if $template_version == "" then null else $template_version end),
      database:  { verdict: $db,        evidence: $db_ev },
      paywall:   { verdict: $paywall,   evidence: $paywall_ev },
      analytics: { verdict: $analytics, evidence: $analytics_ev },
      stack: { expo: $expo, react_native: $rn, react: $react },
      framework: {
        name:      (if $fw_name == "" then null else $fw_name end),
        version:   (if $fw_version == "" then null else $fw_version end),
        secondary: (if $fw_secondary == "" then null else $fw_secondary end)
      },
      release: {
        tag: (if $tag == "" then null else $tag end),
        published: (if $pub == "" then null else ($pub | split("T")[0]) end),
        age_days: (if $age == "" then null else ($age | tonumber) end),
        unreleased_commits: (if $unreleased == "" then null else ($unreleased | tonumber) end),
        notes: $notes
      },
      releases: $releases,
      branches: {
        dev_ahead:  (if $dev_ahead  == "" then null else ($dev_ahead  | tonumber) end),
        dev_behind: (if $dev_behind == "" then null else ($dev_behind | tonumber) end)
      },
      ci: { workflow: $ci_name, conclusion: $ci_concl, date: $ci_date },
      open: { prs: $pr_count, pr_titles: $pr_titles, issues: $issues, issues_hot: $issues_hot },
      roadmap: (if $total_n == "" then null else
        { done: ($done_n|tonumber), total: ($total_n|tonumber),
          percent: ($percent|tonumber), ref: $roadmap_ref } end)
    }' > "$out"
}

# ── Discover ─────────────────────────────────────────────────────────────────
STAGE="discover"
REPOS=$(gh repo list "$ORG" --limit 100 \
  --json name,isPrivate,isArchived,defaultBranchRef 2>/dev/null || true)

# `gh repo list` is a GraphQL org query, which a GitHub App installation token
# cannot always answer. /installation/repositories is the REST endpoint that token
# is actually for, and it returns exactly the repos the App is installed on — so
# CI discovers the fleet without a manifest, same as a human does locally.
if [[ -z "$REPOS" ]] || ! jq -e 'type == "array"' >/dev/null 2>&1 <<< "$REPOS"; then
  REPOS=$(gh api --paginate /installation/repositories \
    --jq '[.repositories[] | {name: .name, isPrivate: .private, isArchived: .archived,
                              defaultBranchRef: {name: .default_branch},
                              owner: .owner.login}]' 2>/dev/null \
    | jq -s 'add // []' 2>/dev/null || true)
  # That endpoint spans every org the App is installed on; keep only this one.
  if [[ -n "$REPOS" ]]; then
    REPOS=$(jq --arg o "$ORG" '[.[] | select(.owner == $o) | del(.owner)]' <<< "$REPOS" 2>/dev/null || echo "")
  fi
fi

if [[ -z "$REPOS" ]] || ! jq -e 'type == "array" and length > 0' >/dev/null 2>&1 <<< "$REPOS"; then
  echo "Error: could not list repos for org '$ORG'." >&2
  echo "       Locally: check 'gh auth status' and org access." >&2
  echo "       In CI: the installation token must come from an App installed on this org" >&2
  echo "       with 'contents: read'. See .claude/reference/cross-repo-token.md." >&2
  exit 1
fi

SELECTED=$(jq -r --arg f "$REPO_FILTER" --argjson all "$INCLUDE_ARCHIVED" '
  [ .[]
    | select($all or (.isArchived | not))
    | select($f == "" or .name == $f) ]
  | sort_by(.name)
  | .[] | [.name, (.isPrivate|tostring), (.defaultBranchRef.name // "main")] | @tsv' <<< "$REPOS")

if [[ -z "$SELECTED" ]]; then
  echo "No repos matched in org '$ORG'." >&2
  exit 0
fi

STAGE="probe"
while IFS=$'\t' read -r name private default_branch; do
  [[ -z "$name" ]] && continue
  probe_repo "$name" "$private" "$default_branch" &
done <<< "$SELECTED"
wait

# A probe that failed (rate limit, a repo pulled mid-run) leaves an empty or
# partial file. Drop those rather than letting one bad repo kill the whole report.
VALID=""
for f in "$TMP"/*.json; do
  [[ -e "$f" ]] || continue
  if jq -e . >/dev/null 2>&1 < "$f"; then
    VALID="$VALID $f"
  else
    echo "Warning: probe failed for $(basename "$f" .json) — omitted from the report." >&2
  fi
done

if [[ -z "$VALID" ]]; then
  echo "Error: every repo probe failed. Check 'gh auth status' and your rate limit" >&2
  echo "       with 'gh api rate_limit'." >&2
  exit 1
fi

STAGE="render"
FLEET=$(jq -s 'sort_by(.name)' $VALID)

FLEET_JSON=$(jq -n --arg org "$ORG" --arg generated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson repos "$FLEET" \
  '{org: $org, generated: $generated, repos: $repos}')

if [[ "$AS_JSON" == "true" ]]; then
  printf '%s\n' "$FLEET_JSON"
  exit 0
fi

# --html renders the same JSON through scripts/fleet-html.mjs. Output goes OUTSIDE
# the repo by default (~/.focalstudio/), not to .claude/scratch/: this template is
# public and most app repos are private, so keeping fleet output un-committable
# should be structural rather than one .gitignore edit away from a leak. It also
# means the file survives `git clean` and can be bookmarked once.
if [[ "$AS_HTML" == "true" ]]; then
  command -v node >/dev/null 2>&1 || { echo "Error: node is required for --html." >&2; exit 1; }
  out="${HTML_OUT:-$HOME/.focalstudio/fleet.html}"
  mkdir -p "$(dirname "$out")"
  # Write JSON beside the page: /standup reads it instead of re-deriving from gh,
  # and it is what a later diff ("what changed since I last looked") would compare.
  printf '%s\n' "$FLEET_JSON" > "${out%.html}.json"
  # Render to a temp file and move into place, so a failure part-way through leaves
  # the previous page intact rather than truncating the one you are about to open.
  if printf '%s\n' "$FLEET_JSON" | node "$SCRIPT_DIR/fleet-html.mjs" > "$out.tmp"; then
    mv "$out.tmp" "$out"
    echo "$out"
    exit 0
  else
    rm -f "$out.tmp"
    echo "Error: rendering failed; the existing page was left untouched." >&2
    exit 1
  fi
fi

# The template's own current version, for the TEMPLATE column's "behind" marker.
# Read from the fleet data rather than this checkout: running `--repo tick` alone
# would otherwise compare against whatever is in the working tree. Empty when the
# template itself was not probed, which suppresses the marker rather than guessing.
TEMPLATE_SELF=$(jq -r '[.[] | select(.kind == "template") | .template_version] | first // ""' <<< "$FLEET")

# ── Render ───────────────────────────────────────────────────────────────────
_age_label() {
  local d="$1"
  [[ "$d" == "never" || -z "$d" ]] && { echo "never"; return 0; }
  [[ "$d" == "0" ]] && { echo "today"; return 0; }
  echo "${d}d ago"
}

render() {
  local count
  count=$(jq 'length' <<< "$FLEET")
  echo "FOCAL STUDIO FLEET  ·  $ORG  ·  $count repos  ·  $(date '+%Y-%m-%d %H:%M')"
  echo
  printf '%-26s %-8s %-9s %-9s %-26s %-8s %4s %7s  %s\n' \
    REPO VER RELEASED TEMPLATE DATABASE CI PRs ISSUES ROADMAP
  printf '%s\n' "$(printf '%.0s─' $(seq 1 128))"

  local name version age tmpl db ci prs issues pct bar
  while IFS=$'\t' read -r name version age tmpl db ci prs issues pct; do
    [[ -z "$name" ]] && continue
    if [[ "$pct" != "-" ]]; then
      bar="$(_bar "$pct") ${pct}%"
    else
      bar="—"
    fi
    printf '%-26s %-8s %-9s %-9s %-26s %-8s %4s %7s  %s\n' \
      "$name" "$version" "$(_age_label "$age")" "$tmpl" "$db" "$ci" "$prs" "$issues" "$bar"
  # Every field is non-empty on purpose: tab is an IFS whitespace character, so
  # `read` coalesces consecutive tabs and an empty column would shift the rest.
  done <<< "$(jq -r --arg self "$TEMPLATE_SELF" '.[] | [
      .name,
      (if .version == "" then "-" else .version end),
      (.release.age_days // "never" | tostring),
      (if .template_version == null then "-"
       elif $self != "" and .template_version != $self then .template_version + "!"
       else .template_version end),
      (if .kind == "site" then "n/a" else .database.verdict end),
      (if .ci.conclusion == "" then "-" else .ci.conclusion end),
      (.open.prs | tostring), (.open.issues | tostring),
      (.roadmap.percent // "-" | tostring)
    ] | @tsv' <<< "$FLEET")"

  echo
  # Only the things that want acting on. A report you skim every day earns its
  # place by what it puts in front of you unprompted.
  local attention
  attention=$(jq -r '
    [ .[] | select(.kind == "app" or .kind == "template") ] as $apps
    | ([ $apps[] | .stack.expo | select(. != "") ] | group_by(.) | max_by(length) | .[0]) as $common
    | ([ $apps[] | select(.kind == "template") | .template_version ] | first) as $self
    | [ $apps[]
        | (if .kind == "app" and $self != null and .template_version != null and .template_version != $self
             then "\(.name): on template \(.template_version) — the template is on \($self)"
             else empty end),
          (if .kind == "app" and .template_version == null
             then "\(.name): no TEMPLATE_VERSION — adoption cannot tell what it is missing"
             else empty end),
          (if (.release.unreleased_commits // 0) > 0
             then "\(.name): \(.release.unreleased_commits) commit(s) on \(.default_branch) past \(.release.tag) — unreleased"
             else empty end),
          (if (.ci.conclusion // "") != "" and .ci.conclusion != "success"
             then "\(.name): last CI run on \(.default_branch) was \(.ci.conclusion) (\(.ci.workflow))"
             else empty end),
          (if .stack.expo != "" and $common != null and .stack.expo != $common
             then "\(.name): expo \(.stack.expo) — the rest of the fleet is on \($common)"
             else empty end),
          (if (.open.issues_hot // 0) > 0
             then "\(.name): \(.open.issues_hot) open issue(s) labelled critical/high"
             else empty end) ]
    | .[]' <<< "$FLEET" || true)
  if [[ -n "$attention" ]]; then
    echo "NEEDS A LOOK"
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      echo "  • $line"
    done <<< "$attention"
    echo
  fi

  # Per-repo detail
  jq -r --argjson n "$RELEASES" '.[] |
    "── \(.name)  (\(.kind)\(if .scope then " · \(.scope) scope" else "" end) · \(if .private then "private" else "public" end))",
    (if .database.verdict != "none detected" and .kind != "site" then
       "   Database   \(.database.verdict)\(if .database.evidence != "" then "  ← \(.database.evidence)" else "" end)" else empty end),
    (if .paywall.verdict != "none" then "   Paywall    \(.paywall.verdict)  ← \(.paywall.evidence)" else empty end),
    (if .analytics.verdict != "none" then "   Analytics  \(.analytics.verdict)  ← \(.analytics.evidence)" else empty end),
    (if .stack.expo != "" or .stack.react_native != "" then
       "   Stack      " + ([ (if .stack.expo != "" then "expo \(.stack.expo)" else empty end),
                             (if .stack.react_native != "" then "rn \(.stack.react_native)" else empty end),
                             (if .stack.react != "" then "react \(.stack.react)" else empty end) ] | join(" · "))
     else empty end),
    (if .release.tag then
       "   Release    \(.release.tag) — \(.release.published) (\(if .release.age_days == 0 then "today" elif .release.age_days == 1 then "1 day ago" else "\(.release.age_days) days ago" end))"
     else "   Release    never released" end),
    (if (.release.unreleased_commits // 0) > 0 then
       "              \(.default_branch) is \(.release.unreleased_commits) commit(s) ahead of the tag — unreleased work" else empty end),
    (if $n <= 1 and .release.notes != "" then (.release.notes | split("\n")[] | "              \(.)") else empty end),
    (if $n > 1 then (.releases[]? | "              \(.tag)  \(.date)  \(.body[0:88])") else empty end),
    (if .branches.dev_ahead != null and (.branches.dev_ahead > 0 or .branches.dev_behind > 0) then
       "   Branches   dev is \(.branches.dev_ahead) ahead / \(.branches.dev_behind) behind \(.default_branch)" else empty end),
    (if .ci.conclusion != "" then "   CI         \(.ci.workflow) · \(.ci.conclusion) · \(.ci.date)" else empty end),
    "   Open       \(.open.prs) PR(s) · \(.open.issues) issue(s)\(if .open.issues_hot > 0 then " (\(.open.issues_hot) critical/high)" else "" end)",
    (.open.pr_titles[]? | "              PR: \(.)"),
    ""' <<< "$FLEET"
}

if [[ "$WRITE" == "true" ]]; then
  DEST="$ROOT/.claude/scratch/fleet-$(date +%Y%m%d-%H%M).md"
  mkdir -p "$(dirname "$DEST")"
  { echo '```'; render; echo '```'; } > "$DEST"
  render
  echo "Written to $DEST"
else
  render
fi
