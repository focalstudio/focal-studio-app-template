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

# ── The app must be bootstrapped ──────────────────────────────────────────────
# app.json still holds [APP_ID] / [APP_SLUG] on a fresh template. Unquoted command
# substitution leaves those literal (they are glob character classes that match no
# file), so Maestro would be handed `APP_ID=[APP_ID]` and fail deep inside a flow
# on an appId that cannot exist. Same gate maestro-e2e.yml applies in CI.
if grep -q '\[APP_SLUG\]' app.json; then
  fail "This repo is still an unbootstrapped template." \
       "app.json has [APP_*] placeholders, so there is no app to drive." \
       "Run scripts/init.sh to bootstrap a real app first."
fi

# ── Maestro CLI ───────────────────────────────────────────────────────────────
if ! command -v maestro > /dev/null 2>&1; then
  fail "maestro not found on PATH." \
       "Install it (see docs/testing.md — note that Homebrew core's \`maestro\`" \
       "is an unrelated app; this is mobile-dev-inc's CLI):" \
       "" \
       "  MAESTRO_VERSION=2.8.0 curl -fsSL https://get.maestro.mobile.dev | bash"
fi

# Maestro is a JVM app whose launcher reads JAVA_HOME specifically — a `java` on
# PATH is not enough, and the error it prints ("Please set the JAVA_HOME variable")
# says nothing about Maestro. CI never hits this because actions/setup-java exports
# JAVA_HOME for free.
if [ -z "${JAVA_HOME:-}" ] && ! /usr/libexec/java_home > /dev/null 2>&1; then
  fail "JAVA_HOME is not set and no JDK was found." \
       "Maestro needs a JDK 17+. With Homebrew's keg-only openjdk@17:" \
       "" \
       "  brew install openjdk@17" \
       "  export JAVA_HOME=\"\$(brew --prefix openjdk@17)\""
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

# ── Resolve identifiers and run ───────────────────────────────────────────────
# Quoted, unlike the original one-liner: a value containing whitespace or a glob
# character would otherwise be split or expanded before Maestro ever saw it.
APP_ID="$(node -p "require('./app.json').expo.ios.bundleIdentifier")"
APP_SCHEME="$(node -p "require('./app.json').expo.scheme")"

echo "▸ Maestro $(maestro --version 2>/dev/null | tail -1) → $APP_ID (Metro :$METRO_PORT)"

# "$@" so a single flow can be run directly: npm run e2e -- .maestro/persistence.yaml
exec maestro test "${@:-.maestro/}" -e APP_ID="$APP_ID" -e APP_SCHEME="$APP_SCHEME"
