#!/bin/bash
# Usage: npm run e2e                    # both flows in .maestro/
#        npm run e2e -- .maestro/persistence.yaml    # one flow
#
# Preflight + launcher for the Maestro flows against a local iOS Simulator.
#
# This used to be a one-liner in package.json. It grew into a script because every
# check below is a failure that was actually hit while validating the flows, and each
# one otherwise surfaces as a 60-second silent assertion timeout against a red
# "No script URL provided" screen — with nothing on stdout to explain why. The flows
# themselves are fine; getting to the point of running them is what is fiddly.
#
# The APP_ID / APP_SCHEME resolution mirrors .github/workflows/maestro-e2e.yml so the
# two cannot drift. Keep them in sync when either changes.

set -euo pipefail

cd "$(dirname "$0")/.."

fail() { echo "✗ $1" >&2; shift; for line in "$@"; do echo "  $line" >&2; done; exit 1; }

# ── Resolve identifiers, and use them as the bootstrap gate ───────────────────
# Quoted, unlike the original one-liner: a value containing whitespace or a glob
# character would otherwise be split or expanded before Maestro ever saw it.
APP_ID="$(node -p "require('./app.json').expo.ios.bundleIdentifier")"
APP_SCHEME="$(node -p "require('./app.json').expo.scheme")"

# On an unbootstrapped template these resolve to the bracketed template
# placeholders. Unquoted substitution used to leave those literal (they are glob
# character classes matching no file), handing Maestro an appId that cannot exist
# and failing deep inside a flow instead of here. Checked first, because "there is
# no app" makes every check below moot.
#
# Deliberately checked by *shape* rather than by grepping app.json for the
# placeholder text: scripts/init.sh rewrites those tokens across `*.sh` too, so a
# literal one written here would be substituted at bootstrap and the check would
# then test for the real slug — inverting it into a gate that always fires.
for value in "$APP_ID" "$APP_SCHEME"; do
  case "$value" in
    *'['* | *']'* | '' | undefined)
      fail "This repo is still an unbootstrapped template." \
           "app.json resolved to placeholder identifiers, so there is no app to drive:" \
           "  bundleIdentifier = $APP_ID" \
           "  scheme           = $APP_SCHEME" \
           "Run scripts/init.sh to bootstrap a real app first."
      ;;
  esac
done

# ── Maestro CLI ───────────────────────────────────────────────────────────────
if ! command -v maestro > /dev/null 2>&1; then
  fail "maestro not found on PATH." \
       "Install it (see docs/testing.md — note that Homebrew core's \`maestro\`" \
       "is an unrelated app; this is mobile-dev-inc's CLI):" \
       "" \
       "  MAESTRO_VERSION=2.8.0 curl -fsSL https://get.maestro.mobile.dev | bash"
fi

# Maestro is a JVM app needing Java 17+. Its launcher is the stock Gradle start
# script: it uses "$JAVA_HOME/bin/java" when JAVA_HOME is set, and otherwise falls
# back to `java` on PATH. Either satisfies it — JAVA_HOME is not required.
#
# Mirrored here rather than checked against /usr/libexec/java_home, which only sees
# JDKs registered under /Library/Java/JavaVirtualMachines. Homebrew's openjdk is
# keg-only and is not registered there, so a java_home-based check reports "no JDK"
# on a machine with a perfectly working `java` on PATH.
#
# Worth pre-empting at all because with neither present the launcher's own version
# probe trips first, printing `[: : integer expression expected` ahead of its real
# error.
if [ -n "${JAVA_HOME:-}" ]; then
  JAVACMD="$JAVA_HOME/bin/java"
  if [ ! -x "$JAVACMD" ]; then
    fail "JAVA_HOME is set but contains no executable bin/java:" \
         "  $JAVA_HOME" \
         "Unset it to fall back to \`java\` on PATH, or point it at a real JDK home." \
         "For Homebrew's openjdk@17 that is:" \
         "" \
         "  \$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
  fi
else
  JAVACMD=java
fi

# Probed by running it, not by `command -v`. macOS ships /usr/bin/java as a stub
# that exists and is executable but has no runtime behind it — it satisfies a
# presence test and then exits 1 on anything real. That stub is precisely what a
# machine with no JDK has, so a presence-only check passes exactly when it matters.
if ! "$JAVACMD" -version > /dev/null 2>&1; then
  fail "No working JDK found — Maestro needs Java 17+." \
       "(\`$JAVACMD\` exists but does not run; on macOS /usr/bin/java is a stub.)" \
       "Homebrew's openjdk@17 is keg-only, so it is not linked onto PATH for you:" \
       "" \
       "  brew install openjdk@17" \
       "  export PATH=\"\$(brew --prefix openjdk@17)/bin:\$PATH\""
fi

# ── Metro must be reachable on the port the *native debug build* probes ───────
# RCTBundleURLProvider in a Debug build probes http://localhost:8081/status and
# expects `packager-status:running`. Nothing in the Expo prebuild bakes a different
# port in — `RCT_METRO_PORT` appears nowhere in the generated Xcode project — so
# `expo start --port N` and `expo run:ios --port N` change only which server the CLI
# talks to, NOT what the installed app looks for. If 8081 is occupied by anything
# else (it commonly is), the app comes up on the red screen with
# `unsanitizedScriptURLString = (null)` and every assertion times out.
#
# E2E_METRO_PORT is the escape hatch for exactly that case. Point it at whatever port
# Metro is really on, and set the matching user default on the simulator:
#
#   xcrun simctl spawn booted defaults write <bundle-id> RCT_jsLocation localhost:<port>
#
# That default survives Maestro's `clearState: true`, so the flows still run clean.
METRO_PORT="${E2E_METRO_PORT:-8081}"
if ! curl -sf "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"; then
  fail "No Metro bundler answering on http://localhost:$METRO_PORT." \
       "Start it in another terminal, from this directory:" \
       "" \
       "  npx expo run:ios     # build + install once, leaves Metro in the foreground" \
       "" \
       "If Metro is running on a different port, something else holds 8081 — the" \
       "native debug build probes 8081 regardless of any --port flag. See the E2E" \
       "section of docs/testing.md for the RCT_jsLocation workaround."
fi

echo "▸ Maestro $(maestro --version 2>/dev/null | tail -1) → $APP_ID (Metro :$METRO_PORT)"

# ── Run, then triage ──────────────────────────────────────────────────────────
# This deliberately no longer `exec`s Maestro. The whole point of keeping it as a
# child process is the seam after it: Apple's SpringBoard segfaults on the
# simulator during Maestro's launchApp/stopApp cycling (#131) — which
# .maestro/persistence.yaml does on purpose and cannot stop doing, since
# force-quit-then-cold-start IS the test. When it happens the flow fails with no
# visible cause and every screenshot from that point shows the iOS home screen
# instead of the app, which reads exactly like an app navigation bug. Nothing here
# causes it and nothing here can fix it; the check below only puts a name on it.
#
# The marker is what dates the scan. `find -newer` takes a file rather than a
# timestamp, so comparing mtimes avoids parsing the .ips header's own
# timezone-suffixed timestamp — `date`'s parsing flags differ irreconcilably
# between BSD and GNU. mktemp rather than a fixed path so two concurrent runs
# cannot share a marker.
MARKER="$(mktemp "${TMPDIR:-/tmp}/e2e-start.XXXXXX")"
trap 'rm -f "$MARKER"' EXIT

# "$@" so a single flow can be run directly: npm run e2e -- .maestro/persistence.yaml
#
# `|| status=$?` because `set -e` would otherwise treat a failed run as the end of
# the script and skip the triage — which is precisely the run that needs it.
# Neither piped nor captured: Maestro draws its own progress UI, and a pipe would
# strip it as well as putting the exit code we are preserving behind pipefail.
#
# Ctrl-C is not trapped. Bash takes the SIGINT along with Maestro and may exit
# before the check runs; the EXIT trap still removes the marker, and a run you
# interrupted yourself is not one that needs explaining.
status=0
maestro test "${@:-.maestro/}" -e APP_ID="$APP_ID" -e APP_SCHEME="$APP_SCHEME" || status=$?

# Advisory, always. It runs on a green run too — a crash that did not fail the run
# still means a screenshot may be of the home screen — prints nothing when the scan
# is clean, and never changes the exit code. A SpringBoard crash and a genuine
# assertion failure can happen in the same run, and turning a red run green here
# would be worse than the confusion it exists to fix.
#
# A repo-relative path is correct: line 18 already cd'd to the repo root.
bash scripts/check-simulator-crashes.sh "$MARKER" || true

exit "$status"
