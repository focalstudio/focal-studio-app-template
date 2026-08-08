#!/bin/bash
# Usage: bash scripts/check-simulator-crashes.sh [marker-file]
#
# Reports iOS Simulator process crashes — Apple's, not the app's.
#
# Given a marker file, scans for crash reports newer than it (scripts/e2e.sh and
# .github/workflows/maestro-e2e.yml both touch one immediately before the flows).
# Given nothing, scans the last hour, which is the "that red run made no sense,
# what actually happened" path you reach for after the fact.
#
# Exit status:  0  no simulator-infrastructure crash in the window
#               1  one or more found
#               2  usage error (a marker was named and does not exist)
#
# Status 1 is ADVISORY. Callers must not turn a red run green on it: a SpringBoard
# crash and a genuine assertion failure can happen in the same run, and hiding the
# second would be worse than the confusion this exists to fix.
#
# ── Why this exists (#131) ────────────────────────────────────────────────────
# SpringBoard — the iOS home screen and app launcher, running as a host process
# under the simulator — segfaults (EXC_BAD_ACCESS at 0x20) during Maestro runs.
# Its launchApp/stopApp cycling seems to provoke it, and .maestro/persistence.yaml
# does exactly that deliberately: force-quit, cold-start, assert the persisted
# state came back through the zod schemas. That flow is not changeable — it *is*
# the test. Three occurrences on one dev machine in four days, none of them
# anything this repo caused or can fix.
#
# What it costs is diagnosis time. The flow fails mid-run with no visible reason,
# and the screenshots under ~/.maestro/tests/<run> show the iOS home screen rather
# than the app — which reads exactly like a navigation bug in the app under test.
# That misreading once cost an hour. Putting a name on it is this script's whole
# job; it prevents nothing.
#
# ── Why mtime, not the report's own timestamp ─────────────────────────────────
# An .ips file's first line is a JSON header carrying `"timestamp":"2026-08-06
# 12:23:59.00 +0100"`. Comparing that means parsing a timezone-suffixed date in
# shell, and `date` takes irreconcilable flags on BSD (macOS) and GNU. The file's
# mtime matches that timestamp to the second, and `find -newer` compares two files
# with no date parsing at all. Note it is `-newer <file>`, not `-newermt` — the
# latter is the GNU-only form people reach for first.
#
# E2E_CRASH_COPY_DIR — if set, matching reports are copied there. CI points it at
# the Maestro debug artifact. Unset locally: the originals are already on the
# machine of whoever is reading this output.

# Deliberately no `set -e`: a nonzero `find` over an unreadable system directory
# is expected and handled below, and the exit status is this script's return
# value rather than an accident of the last command.
set -uo pipefail

MARKER="${1:-}"
WINDOW_MINUTES=60

if [ -n "$MARKER" ] && [ ! -f "$MARKER" ]; then
  echo "check-simulator-crashes: marker file not found: $MARKER" >&2
  exit 2
fi

# $HOME, never a literal path. Simulator processes run as the invoking user, so
# ReportCrash files their crashes under that user's home — verified against the
# three SpringBoard reports behind #131, and true of the `runner` user in CI. It
# is also the test seam: run this with HOME pointed at a fixture directory and the
# whole detector is exercisable without waiting for a real segfault.
#
# The system root only ever holds crashes of root-owned processes. Scanned
# defensively — it is root:_analyticsusers 0770, so a machine whose user is not in
# that group gets a permission error, hence the discarded stderr below.
#
# NOT scanned: ~/Library/Logs/CoreSimulator/<UDID>/CrashReporter/DiagnosticLogs.
# It looks exactly like where this would live. On macOS 26 it is empty on every
# device UDID, checked on a machine with three real SpringBoard crashes on disk.
SCAN_ROOTS=("$HOME/Library/Logs/DiagnosticReports" "/Library/Logs/DiagnosticReports")

# -maxdepth 2 rather than 1 so macOS's own Retired/ subdirectory — where it moves
# aged reports — is covered, without walking anything deeper.
find_reports() {
  local pattern="$1" root
  for root in "${SCAN_ROOTS[@]}"; do
    [ -d "$root" ] || continue
    if [ -n "$MARKER" ]; then
      find "$root" -maxdepth 2 -name "$pattern" -newer "$MARKER" 2> /dev/null
    else
      find "$root" -maxdepth 2 -name "$pattern" -mmin "-$WINDOW_MINUTES" 2> /dev/null
    fi
  done
}

# Bucket A — the simulator's own infrastructure, and the only bucket that drives
# the exit status. Matched by filename alone, which is why this half needs no read
# access to the 0600 reports: SpringBoard and backboardd are iOS-only process
# names, so a report for either sitting on a Mac is by definition a simulated one.
# backboardd rides along because it is the simulator's display server — when it
# dies SpringBoard dies with it, and a run sees the identical symptom.
infra=()
while IFS= read -r report; do
  [ -n "$report" ] && infra+=("$report")
done < <(
  find_reports 'SpringBoard-*.ips'
  find_reports 'backboardd-*.ips'
)

# Bucket B — everything else that crashed *inside* the simulator in the same
# window, most usefully the app under test. Its process name is the Xcode product
# name, which app.json does not carry (both callers resolve only bundleIdentifier
# and scheme), so matching it by name would be a guess. `"platform":7` in the .ips
# header is the field that identifies a simulated process without guessing — a
# host-side crash reads platform 1, which is what strips the MTLCompilerService
# noise that would otherwise dominate this list.
#
# Listed, never counted toward the exit status. If the app under test crashed,
# that is a product failure and nothing here may excuse it.
others=()
while IFS= read -r report; do
  [ -n "$report" ] || continue
  case "$(basename "$report")" in SpringBoard-* | backboardd-*) continue ;; esac
  if head -n 1 "$report" 2> /dev/null | grep -q '"platform"[[:space:]]*:[[:space:]]*7'; then
    others+=("$report")
  fi
done < <(find_reports '*.ips')

# bash 3.2 — still what /bin/bash is on macOS — errors on ${arr[@]} for an empty
# array under `set -u`, so every expansion below sits behind a length check.
if [ "${#infra[@]}" -eq 0 ] && [ "${#others[@]}" -eq 0 ]; then
  exit 0
fi

copy_out() {
  [ -n "${E2E_CRASH_COPY_DIR:-}" ] || return 0
  mkdir -p "$E2E_CRASH_COPY_DIR" 2> /dev/null || return 0
  # An .ips carries device identifiers (crashReporterKey, deviceIdentifierForVendor,
  # userID). On an ephemeral CI runner those identify nothing, which is why only CI
  # sets this — do not start copying these off a developer's own machine.
  cp "$1" "$E2E_CRASH_COPY_DIR/" 2> /dev/null || true
}

echo ""
echo "────────────────────────────────────────────────────────────────────────────"

if [ "${#infra[@]}" -gt 0 ]; then
  echo "⚠ The iOS Simulator crashed during this run. This is Apple's bug, not yours."
  echo ""
  for report in "${infra[@]}"; do
    echo "  $report"
    copy_out "$report"
  done
  echo ""
  echo "  SpringBoard is the simulator's home screen and app launcher. When it"
  echo "  segfaults mid-run, Maestro's next launchApp or tapOn goes nowhere, the"
  echo "  flow fails with no visible cause, and every screenshot from that point"
  echo "  shows the iOS home screen instead of the app. Nothing in this repo"
  echo "  causes it and nothing here can fix it — see issue #131."
  echo ""
  echo "  Re-run the flow before believing the failure."
fi

if [ "${#others[@]}" -gt 0 ]; then
  [ "${#infra[@]}" -gt 0 ] && echo ""
  echo "  Other processes also crashed inside the simulator in the same window."
  echo "  If one of these is the app under test, THAT failure is real:"
  echo ""
  for report in "${others[@]}"; do
    echo "  $report"
    copy_out "$report"
  done
fi

echo "────────────────────────────────────────────────────────────────────────────"
echo ""

[ "${#infra[@]}" -gt 0 ] && exit 1
exit 0
