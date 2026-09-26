#!/bin/bash
# Usage: bash scripts/install-fleet-agent.sh [--interval SECONDS] [--direct|--copy] [--uninstall] [--status]
#
# Installs a launchd agent that refreshes the fleet dashboard every 3 hours, so
# ~/.focalstudio/fleet.html is already current whenever you open it. The point is that
# nothing has to be typed: a dashboard you must remember to regenerate is a command
# with extra steps, and gets skipped exactly like the command it replaced.
#
#   --interval N   seconds between refreshes (default 10800 = 3h)
#   --direct       require running from the repo; fail loudly instead of falling back
#   --copy         skip the direct attempt and go straight to the relocated copy
#   --uninstall    stop and remove the agent
#   --status       report whether it is loaded, when the page was last written, and
#                  whether a relocated runtime copy has gone stale (see below)
#
# ── The TCC problem, and how this resolves it ──────────────────────────────────
# macOS blocks background agents from reading ~/Desktop, ~/Documents, ~/Downloads and
# iCloud Drive. A LaunchAgent pointed at a repo in one of those exits 126 with
# "Operation not permitted" and the dashboard silently never updates — which is worse
# than having no agent, because the page still exists and looks plausible.
#
# Only THIS repo matters. Every other repo in the fleet is read through the GitHub API,
# not the filesystem, so there is nothing to grant for them.
#
# Two ways out, and this script takes whichever is available:
#
#   direct  — the agent runs straight from the repo. Requires Full Disk Access for
#             /bin/bash (System Settings > Privacy & Security > Full Disk Access), or a
#             repo outside the protected directories. Nothing can go stale.
#   copy    — the three files a refresh needs are copied to ~/.focalstudio/bin and the
#             agent runs those. Works with no grant at all, at the cost of a copy that
#             can drift from its source.
#
# Direct is tried first and proven by running the agent and reading its exit code,
# rather than by guessing whether the grant exists — TCC state is not queryable, and a
# wrong guess here produces exactly the silent staleness above. Copy mode is the
# fallback, and --status says which one is live.
#
# A copy that drifts from its source is the problem this repo exists to solve, so in
# copy mode --status diffs the two and names any file that differs.
#
# macOS only — launchd is the mechanism.

set -euo pipefail

LABEL="com.focalstudio.fleet"
INTERVAL=10800
ACTION="install"
MODE="auto"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval)  INTERVAL="$2"; shift 2 ;;
    --direct)    MODE="direct"; shift ;;
    --copy)      MODE="copy"; shift ;;
    --uninstall) ACTION="uninstall"; shift ;;
    --status)    ACTION="status"; shift ;;
    -h|--help)   sed -n '2,36p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[[ "$(uname)" == "Darwin" ]] || { echo "Error: launchd is macOS-only." >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_SRC="$ROOT/templates/launchd/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
RUNTIME="$HOME/.focalstudio/bin"
DOMAIN="gui/$(id -u)"

# The files a refresh actually touches: the script, its renderer, and the manifest it
# reads repo `scope` from. Paths are relative to the repo root and preserved in the
# copy, because fleet-report.sh resolves the manifest as $ROOT/.github/shared-paths.json.
RUNTIME_FILES=(
  "scripts/fleet-report.sh"
  "scripts/fleet-html.mjs"
  ".github/shared-paths.json"
)

is_protected() {
  case "$1" in
    "$HOME"/Desktop/*|"$HOME"/Documents/*|"$HOME"/Downloads/*|"$HOME"/Library/Mobile\ Documents/*) return 0 ;;
    *) return 1 ;;
  esac
}

case "$ACTION" in
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "Agent loaded."
      launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E '^[[:space:]]+(state|last exit code|runs) ' || true
    else
      echo "Agent not loaded."
    fi

    # Which mode is live is read from the installed plist, not inferred — the repo
    # could have been moved, or Full Disk Access granted, since the last install.
    live_root=$(sed -n 's|.*<string>\(.*\)/scripts/fleet-report.sh</string>.*|\1|p' "$PLIST_DST" 2>/dev/null | head -1)
    if [[ -n "$live_root" ]]; then
      if [[ "$live_root" == "$RUNTIME" ]]; then
        echo "Mode: copy (running from $RUNTIME)"
        stale=0
        for rel in "${RUNTIME_FILES[@]}"; do
          if ! cmp -s "$ROOT/$rel" "$RUNTIME/$rel" 2>/dev/null; then
            echo "  STALE: $rel differs from the repo"
            stale=1
          fi
        done
        if [[ "$stale" -eq 1 ]]; then
          echo "  → re-run: bash scripts/install-fleet-agent.sh"
        else
          echo "  Runtime copy matches the repo."
        fi
        if ! is_protected "$ROOT" ; then
          echo "  The repo is no longer in a protected directory — re-run to switch to direct mode."
        else
          echo "  Grant Full Disk Access to /bin/bash and re-run to drop the copy entirely."
        fi
      else
        echo "Mode: direct (running from $live_root — nothing to go stale)"
      fi
    fi

    if [[ -f "$HOME/.focalstudio/fleet.html" ]]; then
      echo "Page last written: $(date -r "$HOME/.focalstudio/fleet.html" '+%Y-%m-%d %H:%M')"
      echo "Open it with: open $HOME/.focalstudio/fleet.html"
    else
      echo "No page yet — it appears on the first run."
    fi
    if [[ -s "$HOME/.focalstudio/fleet.log" ]]; then
      echo "Last log line: $(tail -1 "$HOME/.focalstudio/fleet.log")"
    fi
    exit 0
    ;;
  uninstall)
    # bootout on a domain that never loaded it exits non-zero; that is not a failure
    # of uninstalling, so it is tolerated.
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    [[ -f "$PLIST_DST" ]] && rm -f "$PLIST_DST"
    for rel in "${RUNTIME_FILES[@]}"; do rm -f "$RUNTIME/$rel"; done
    echo "Agent removed. ~/.focalstudio/fleet.{html,json,log} were left alone — delete them yourself if you want the data gone."
    exit 0
    ;;
esac

[[ -f "$PLIST_SRC" ]] || { echo "Error: $PLIST_SRC is missing." >&2; exit 1; }

for dep in gh jq node; do
  command -v "$dep" >/dev/null 2>&1 || { echo "Error: $dep is required (the agent runs fleet-report.sh)." >&2; exit 1; }
done

gh auth status >/dev/null 2>&1 || {
  echo "Error: gh is not authenticated. The agent would fail every run." >&2
  echo "       Run 'gh auth login' first." >&2
  exit 1
}

# Every mode needs the org: copy mode bakes it into the agent's env, direct mode has
# fleet-report.sh derive it from the same origin on every run. Resolved before any
# agent is written, so a repo with no origin stops here rather than after the
# direct-mode attempt has already loaded an agent that can never produce a page.
# `|| true`: under pipefail a missing origin would trip errexit silently, before the
# guard below could say why.
origin="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
AGENT_ORG="$(sed -E 's#\.git$##; s#.*[:/]([^/]+)/[^/]+$#\1#' <<< "$origin")"
[[ -n "$AGENT_ORG" ]] || {
  echo "Error: could not resolve the GitHub org from 'git remote get-url origin'." >&2
  echo "       The agent reads the fleet from that org; add the remote and re-run." >&2
  exit 1
}

# Bake the resolved directories of the tools the agent needs into its PATH. launchd
# hands an agent a minimal PATH, so deriving this from where the tools ACTUALLY are
# beats hardcoding a Homebrew prefix that differs between Intel and Apple Silicon.
AGENT_PATH="$(
  for dep in gh jq node; do dirname "$(command -v "$dep")"; done | sort -u | tr '\n' ':' | sed 's/:$//'
)"
AGENT_PATH="$AGENT_PATH:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.focalstudio"

# ── Writing and loading the agent ─────────────────────────────────────────────
# Split out because a direct-mode attempt that fails gets redone in copy mode, and
# doing that twice by hand is how the two paths drift apart.
write_and_load() {
  local agent_root="$1" agent_org="$2"

  # `|` as the sed delimiter: every token's value is a path, and `/` would need escaping.
  sed -e "s|__REPO__|$agent_root|g" \
      -e "s|__HOME__|$HOME|g" \
      -e "s|__PATH__|$AGENT_PATH|g" \
      -e "s|__ORG__|$agent_org|g" \
      "$PLIST_SRC" > "$PLIST_DST"

  if [[ "$INTERVAL" != "10800" ]]; then
    /usr/bin/sed -i '' "/<key>StartInterval<\/key>/{n;s|<integer>[0-9]*</integer>|<integer>$INTERVAL</integer>|;}" "$PLIST_DST"
  fi

  plutil -lint "$PLIST_DST" >/dev/null || { echo "Error: generated plist is malformed." >&2; exit 1; }

  # Idempotent: bootout an existing instance before bootstrapping, or the second
  # install fails with "service already loaded" and leaves the OLD interval running.
  #
  # bootout returns before the service is actually gone. Bootstrapping into that gap
  # fails with "Bootstrap failed: 5: Input/output error" — which is what a second
  # install hit while the first run was still going, so the wait is not theoretical.
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  local gone=0
  for _ in $(seq 1 60); do
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || { gone=1; break; }
    sleep 1
  done
  [[ "$gone" -eq 1 ]] || echo "  (previous agent still unloading; continuing anyway)" >&2

  launchctl bootstrap "$DOMAIN" "$PLIST_DST"
  launchctl enable "$DOMAIN/$LABEL"
}

# Runs the agent once and returns its exit code. TCC state cannot be queried, so
# whether the agent can actually read the repo is settled by making it try —
# guessing produces exactly the silent staleness this is meant to prevent.
probe_run() {
  : > "$HOME/.focalstudio/fleet.log"
  launchctl kickstart -k "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  local waited=0
  while [[ $waited -lt 120 ]]; do
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -q "state = running" || break
    sleep 2; waited=$((waited + 2))
  done
  # The exit code is not recorded the instant the process dies, so poll for a numeric
  # one rather than reading once and calling an empty result "unknown" — which is how
  # a denial got misreported as an indeterminate failure.
  local code=""
  for _ in $(seq 1 15); do
    code=$(launchctl print "$DOMAIN/$LABEL" 2>/dev/null \
      | sed -n 's/^[[:space:]]*last exit code = \([0-9][0-9]*\).*/\1/p' | head -1)
    [[ -n "$code" ]] && break
    sleep 1
  done

  # The log is the more reliable witness: launchctl may report "(never exited)" for a
  # run that already failed, but the denial message is unambiguous when present.
  if grep -q "Operation not permitted" "$HOME/.focalstudio/fleet.log" 2>/dev/null; then
    echo "126"; return 0
  fi
  echo "${code:-}"
}

install_copy() {
  for rel in "${RUNTIME_FILES[@]}"; do
    mkdir -p "$RUNTIME/$(dirname "$rel")"
    cp "$ROOT/$rel" "$RUNTIME/$rel"
  done
  # git is not in the copy, so fleet-report.sh cannot derive the org from a remote.
  # The preflight resolved it where the repo IS readable; bake it into the agent's env.
  write_and_load "$RUNTIME" "$AGENT_ORG"
  AGENT_ROOT="$RUNTIME"
  AGENT_MODE="copy"
}

AGENT_ROOT=""
AGENT_MODE=""

if [[ "$MODE" == "copy" ]]; then
  echo "Copy mode requested."
  install_copy
elif ! is_protected "$ROOT"; then
  # Nothing to work around — no copy, nothing to go stale.
  write_and_load "$ROOT" ""
  AGENT_ROOT="$ROOT"; AGENT_MODE="direct"
else
  echo "Repo is in a macOS-protected directory. Trying to run from it directly..."
  write_and_load "$ROOT" ""
  code="$(probe_run)"
  if [[ "$code" == "0" ]]; then
    echo "  Full Disk Access is in effect — running straight from the repo."
    AGENT_ROOT="$ROOT"; AGENT_MODE="direct"
  elif [[ "$MODE" == "direct" ]]; then
    echo "Error: --direct was requested but the agent could not read the repo (exit ${code:-unknown})." >&2
    echo "       $(tail -1 "$HOME/.focalstudio/fleet.log" 2>/dev/null)" >&2
    echo >&2
    echo "       Grant Full Disk Access to /bin/bash:" >&2
    echo "         System Settings > Privacy & Security > Full Disk Access > + > Cmd-Shift-G > /bin/bash" >&2
    echo "       then re-run this script. Or drop --direct to use a relocated copy." >&2
    exit 1
  else
    echo "  Denied by macOS (exit ${code:-unknown}) — falling back to a copy in $RUNTIME."
    echo "  To run from the repo instead, grant Full Disk Access to /bin/bash:"
    echo "    System Settings > Privacy & Security > Full Disk Access > + > Cmd-Shift-G > /bin/bash"
    echo "  then re-run this script; it will pick direct mode up on its own."
    install_copy
  fi
fi

# A failed direct probe leaves its "Operation not permitted" in the log. Once copy
# mode is installed that line describes a superseded attempt, and --status reporting
# it as the latest news is worse than saying nothing.
: > "$HOME/.focalstudio/fleet.log"
launchctl kickstart "$DOMAIN/$LABEL" >/dev/null 2>&1 || true

echo
echo "Installed $LABEL — refreshing every $((INTERVAL / 60)) minutes."
echo "  mode:      $AGENT_MODE$([[ "$AGENT_MODE" == "copy" ]] && echo "  (re-run this script after changing the repo)")"
echo "  runs from: $AGENT_ROOT"
echo "  page:      $HOME/.focalstudio/fleet.html"
echo "  log:       $HOME/.focalstudio/fleet.log"
echo
echo "RunAtLoad fired the first refresh just now; it takes ~30s. Then:"
echo "  open $HOME/.focalstudio/fleet.html      # bookmark this"
echo "  bash scripts/install-fleet-agent.sh --status"
