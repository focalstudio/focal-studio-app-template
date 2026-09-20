#!/bin/bash
# Usage: bash scripts/install-fleet-agent.sh [--interval SECONDS] [--uninstall] [--status]
#
# Installs a launchd agent that refreshes the fleet dashboard every 3 hours, so
# ~/.focalstudio/fleet.html is already current whenever you open it. The point is that
# nothing has to be typed: a dashboard you must remember to regenerate is a command
# with extra steps, and gets skipped exactly like the command it replaced.
#
#   --interval N   seconds between refreshes (default 10800 = 3h)
#   --uninstall    stop and remove the agent
#   --status       report whether it is loaded, when the page was last written, and
#                  whether a relocated runtime copy has gone stale (see below)
#
# ── The TCC problem, and why there may be a copy in ~/.focalstudio/bin ──────────
# macOS blocks background agents from reading ~/Desktop, ~/Documents, ~/Downloads and
# iCloud Drive. A LaunchAgent pointed at a repo in one of those exits 126 with
# "Operation not permitted" and the dashboard silently never updates — which is worse
# than having no agent, because the page still exists and looks plausible.
#
# The alternative is granting Full Disk Access to /bin/bash, which hands every script
# on the machine the same reach to fix one dashboard. So: when the repo sits in a
# protected directory, the three files the refresh actually needs are copied to
# ~/.focalstudio/bin and the agent runs those. When it does not, the agent points
# straight at the repo and there is no copy to go stale.
#
# A copy that drifts from its source is the exact problem this repo exists to solve,
# so it is checked rather than hoped about: --status compares them, and re-running
# this script is how you update. `npm run fleet` always uses the repo.
#
# macOS only — launchd is the mechanism.

set -euo pipefail

LABEL="com.focalstudio.fleet"
INTERVAL=10800
ACTION="install"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval)  INTERVAL="$2"; shift 2 ;;
    --uninstall) ACTION="uninstall"; shift ;;
    --status)    ACTION="status"; shift ;;
    -h|--help)   sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
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

    if [[ -d "$RUNTIME" ]]; then
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
        echo "Runtime copy matches the repo."
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

# Bake the resolved directories of the tools the agent needs into its PATH. launchd
# hands an agent a minimal PATH, so deriving this from where the tools ACTUALLY are
# beats hardcoding a Homebrew prefix that differs between Intel and Apple Silicon.
AGENT_PATH="$(
  for dep in gh jq node; do dirname "$(command -v "$dep")"; done | sort -u | tr '\n' ':' | sed 's/:$//'
)"
AGENT_PATH="$AGENT_PATH:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.focalstudio"

if is_protected "$ROOT"; then
  echo "Repo is in a macOS-protected directory; installing a runtime copy in $RUNTIME."
  echo "  (a LaunchAgent cannot read it in place — see this script's header)"
  for rel in "${RUNTIME_FILES[@]}"; do
    mkdir -p "$RUNTIME/$(dirname "$rel")"
    cp "$ROOT/$rel" "$RUNTIME/$rel"
  done
  AGENT_ROOT="$RUNTIME"
  # git is not in the copy, so fleet-report.sh cannot derive the org from a remote.
  # Resolve it here, where the repo IS readable, and bake it into the agent's env.
  AGENT_ORG="$(git -C "$ROOT" remote get-url origin 2>/dev/null \
    | sed -E 's#\.git$##; s#.*[:/]([^/]+)/[^/]+$#\1#')"
  [[ -n "$AGENT_ORG" ]] || { echo "Error: could not resolve the org from origin." >&2; exit 1; }
else
  AGENT_ROOT="$ROOT"
  AGENT_ORG=""
fi

# `|` as the sed delimiter: every token's value is a path, and `/` would need escaping.
sed -e "s|__REPO__|$AGENT_ROOT|g" \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__PATH__|$AGENT_PATH|g" \
    -e "s|__ORG__|$AGENT_ORG|g" \
    "$PLIST_SRC" > "$PLIST_DST"

if [[ "$INTERVAL" != "10800" ]]; then
  /usr/bin/sed -i '' "/<key>StartInterval<\/key>/{n;s|<integer>[0-9]*</integer>|<integer>$INTERVAL</integer>|;}" "$PLIST_DST"
fi

plutil -lint "$PLIST_DST" >/dev/null || { echo "Error: generated plist is malformed." >&2; exit 1; }

# Idempotent: bootout an existing instance before bootstrapping, or the second install
# fails with "service already loaded" and leaves the OLD interval running.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST_DST"
launchctl enable "$DOMAIN/$LABEL"

echo "Installed $LABEL — refreshing every $((INTERVAL / 60)) minutes."
echo "  runs from: $AGENT_ROOT"
echo "  page:      $HOME/.focalstudio/fleet.html"
echo "  log:       $HOME/.focalstudio/fleet.log"
echo
echo "RunAtLoad fired the first refresh just now; it takes ~30s. Then:"
echo "  open $HOME/.focalstudio/fleet.html      # bookmark this"
echo "  bash scripts/install-fleet-agent.sh --status"
