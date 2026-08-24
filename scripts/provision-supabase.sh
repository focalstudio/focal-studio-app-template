#!/bin/bash
# Usage: SUPABASE_ACCESS_TOKEN=sbp_... bash scripts/provision-supabase.sh <project-name> [options]
#
# Does every step docs/backends/supabase.md tells you to do by hand:
#   1. Creates a Supabase project          (POST   /v1/projects)
#   2. Waits for it to come up             (GET    /v1/projects/{ref})
#   3. Reads back the publishable key      (GET    /v1/projects/{ref}/api-keys?reveal=true)
#   4. Writes .env.local                   (local)
#   5. Applies schema.sql                  (POST   /v1/projects/{ref}/database/query)
#   6. Proves RLS + the grants are real    (same endpoint, read-only)
#   7. Sets redirect URLs and providers    (PATCH  /v1/projects/{ref}/config/auth)
#
# It cannot create your Supabase *account* — signup is a ToS-and-captcha flow with no API,
# and no script should be automating someone's account creation. Everything after signup
# is here.
#
# Run `bash scripts/add-backend.sh supabase` first: that wires the adapter into the app,
# this fills in the project behind it. The two halves are deliberately separate — you can
# re-provision a project without touching the app's source, and vice versa.
#
# Structurally smoke-tested by .github/workflows/template-backend-smoke-test.yml, which
# runs --dry-run (no token, no network).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API="https://api.supabase.com"
SCHEMA="templates/backends/supabase/schema.sql"

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------

PROJECT_NAME=""
ORG_SLUG=""
REGION="us-east-1"
REF=""
AUTOCONFIRM="no"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
APPLE_CLIENT_IDS=""
SET_CI_SECRETS="no"
DRY_RUN="no"
FORCE="no"

usage() {
  cat <<'EOF'
Usage: SUPABASE_ACCESS_TOKEN=sbp_... bash scripts/provision-supabase.sh <project-name> [options]

  --org <slug>              Organization to create the project in. Required only if
                            your account has more than one.
  --region <region>         AWS region (default: us-east-1). PERMANENT — a project
                            cannot be moved later. Pick one near your users.
  --ref <ref>               Skip creation and configure an existing project. Use this
                            to resume after a timeout, or to re-apply the schema.
  --autoconfirm             Turn OFF email confirmation. Convenient in development,
                            wrong in production — see docs/backends/supabase.md.
  --google-client-id <id>       Enable Google sign-in. Both are needed.
  --google-client-secret <s>    Get them from Google Cloud (a WEB client, not iOS).
  --apple-client-ids <ids>  Enable Apple sign-in. This is your iOS bundle identifier,
                            comma-separated if more than one.
  --set-ci-secrets          Also set the SUPABASE_URL / SUPABASE_ANON_KEY repo secrets
                            that .github/workflows/supabase-keepalive.yml needs.
  --dry-run                 Print every request that would be sent, send none.
  --force                   Overwrite Supabase values already in .env.local.

Full guide: docs/backends/supabase.md
EOF
}

# `--org --region us-east-1` would otherwise assign "--region" as the org slug, and a flag
# given last with no value would `shift 2` past the end — which under `set -e` aborts with
# bash's "shift count out of range" rather than anything a caller can act on. No value this
# script takes (name, slug, region, ref, client id, bundle id) legitimately starts with `-`.
need_value() {
  case "${2:-}" in
    ""|-*) echo "Error: $1 needs a value."; echo; usage; exit 1 ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    --org)                   need_value "$1" "${2:-}"; ORG_SLUG="$2";             shift 2 ;;
    --region)                need_value "$1" "${2:-}"; REGION="$2";               shift 2 ;;
    --ref)                   need_value "$1" "${2:-}"; REF="$2";                  shift 2 ;;
    --autoconfirm)           AUTOCONFIRM="yes";                                   shift ;;
    --google-client-id)      need_value "$1" "${2:-}"; GOOGLE_CLIENT_ID="$2";     shift 2 ;;
    --google-client-secret)  need_value "$1" "${2:-}"; GOOGLE_CLIENT_SECRET="$2"; shift 2 ;;
    --apple-client-ids)      need_value "$1" "${2:-}"; APPLE_CLIENT_IDS="$2";     shift 2 ;;
    --set-ci-secrets)        SET_CI_SECRETS="yes";          shift ;;
    --dry-run)               DRY_RUN="yes";                 shift ;;
    --force)                 FORCE="yes";                   shift ;;
    -h|--help)               usage; exit 0 ;;
    -*)                      echo "Error: unknown option $1"; echo; usage; exit 1 ;;
    *)
      if [ -n "$PROJECT_NAME" ]; then
        echo "Error: unexpected argument '$1' (project name is already \"$PROJECT_NAME\")."
        echo "Quote names containing spaces."
        exit 1
      fi
      PROJECT_NAME="$1"; shift ;;
  esac
done

if [ -z "$PROJECT_NAME" ] && [ -z "$REF" ]; then
  echo "Error: a project name is required (or --ref to configure an existing project)."
  echo
  usage
  exit 1
fi

# Google needs both halves or neither — one alone produces a provider that is enabled
# and cannot complete an exchange, which fails at sign-in rather than here.
if { [ -n "$GOOGLE_CLIENT_ID" ] && [ -z "$GOOGLE_CLIENT_SECRET" ]; } ||
   { [ -z "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; }; then
  echo "Error: --google-client-id and --google-client-secret must be given together."
  echo "Supabase performs the token exchange server-side and needs both."
  exit 1
fi

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

for tool in curl jq python3 openssl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: $tool is required but not installed."
    exit 1
  fi
done

# The token stays in the environment for exactly this run and is never written to disk,
# never passed as an argument (argv is world-readable via `ps`), and never echoed. It is
# an account-wide credential: it can delete every project you own. That is the opposite
# of the publishable key this script writes into .env.local, which is designed to ship
# inside a client binary — Row Level Security, not key secrecy, protects the data.
if [ "$DRY_RUN" != "yes" ] && [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  cat <<'EOF'
Error: SUPABASE_ACCESS_TOKEN is not set.

Create one at https://supabase.com/dashboard/account/tokens, then:

    SUPABASE_ACCESS_TOKEN=sbp_... bash scripts/provision-supabase.sh "My App"

Prefixing the command like that keeps the token out of your shell history file and out
of any file on disk. Do not add it to .env.local — it is an account-wide token that can
delete every project you own, and nothing in the app ever needs it.
EOF
  exit 1
fi

if [ ! -f "$SCHEMA" ]; then
  echo "Error: $SCHEMA not found. Is this the app template repo root?"
  exit 1
fi

if ! grep -q '^const BACKEND = "supabase";' env.js 2>/dev/null; then
  # A dry run only exercises argument parsing and request shapes, so it stays useful in
  # the template repo itself — where BACKEND is deliberately "none" and always will be.
  # That is what template-backend-smoke-test.yml runs.
  if [ "$DRY_RUN" = "yes" ]; then
    echo "Warning: BACKEND is not \"supabase\" in env.js — a real run would stop here."
    echo
  else
  echo "Error: this app does not have the Supabase backend wired yet."
  echo
  echo "Run this first, then re-run this script:"
  echo "    bash scripts/add-backend.sh supabase"
  echo
  echo "That installs the adapter and makes the Supabase env vars required. This script"
  echo "creates the project those vars point at."
  exit 1
  fi
fi

if [ -f .env.local ] && grep -q '^EXPO_PUBLIC_SUPABASE_URL=' .env.local && [ "$FORCE" != "yes" ]; then
  echo "Error: .env.local already has EXPO_PUBLIC_SUPABASE_URL."
  echo
  echo "This app already points at a Supabase project. Re-run with --force to repoint it"
  echo "at a new one, or pass --ref <ref> --force to re-apply the schema to the existing"
  echo "project without creating a second one."
  exit 1
fi

# Request bodies are staged here rather than passed on the command line, because argv is
# world-readable via `ps` and --google-client-secret is a real secret. The directory only
# ever holds flat files, so an explicit glob-and-rmdir cleans it exactly — and avoids the
# `rm -rf` this repo denylists outright.
TMP="$(mktemp -d)"
trap 'rm -f "$TMP"/*; rmdir "$TMP" 2>/dev/null || true' EXIT

# ---------------------------------------------------------------------------
# API helper
# ---------------------------------------------------------------------------
# Masks any top-level field whose name looks like a credential, for --dry-run output only.
# Real requests are never passed through it.
REDACT='with_entries(if (.key | test("secret|pass|password|key"; "i")) then .value = "***redacted***" else . end)'

# Writes the response body to $TMP/body and returns non-zero on any non-2xx, printing
# the body — Supabase's error messages are specific ("free plan project limit reached",
# "region not available") and swallowing them would make every failure look the same.
api() {
  local method="$1" path="$2" body="${3:-}"

  if [ "$DRY_RUN" = "yes" ]; then
    # stdout, not stderr: under --dry-run this dump IS the output, so `... --dry-run | tee`
    # has to see it. Only genuine errors below go to stderr.
    echo "    [dry-run] $method $path"
    # Bodies are passed to curl as `@file`, the form --data-binary wants. Deref it here so
    # a dry run shows the JSON that would go over the wire rather than a path.
    #
    # Redacted on the way out. A dry run exists to be read, piped, and pasted into an issue,
    # and this script's own smoke test tees it into a CI log — printing
    # --google-client-secret verbatim there would undo the argv and mktemp care everywhere
    # else. Keys are matched by name so a field added later is redacted by default rather
    # than leaking until someone notices.
    case "$body" in
      "")  ;;
      @*)  jq "$REDACT" < "${body#@}" | sed 's/^/    /' ;;
      *)   printf '%s' "$body" | jq "$REDACT" | sed 's/^/    /' ;;
    esac
    echo '{}' > "$TMP/body"
    return 0
  fi

  local args=(-sS -X "$method" "$API$path"
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"
    -H "Content-Type: application/json"
    -o "$TMP/body" -w '%{http_code}')
  [ -n "$body" ] && args+=(--data-binary "$body")

  local code
  code="$(curl "${args[@]}")"

  case "$code" in
    2*) return 0 ;;
    401) echo "Error: SUPABASE_ACCESS_TOKEN was rejected (401). Is it current?" >&2; return 1 ;;
    *)
      echo "Error: $method $path returned HTTP $code" >&2
      jq -r '.message // .msg // .' < "$TMP/body" 2>/dev/null | sed 's/^/  /' >&2 ||
        sed 's/^/  /' < "$TMP/body" >&2
      return 1 ;;
  esac
}

echo "==> Provisioning Supabase"
[ "$DRY_RUN" = "yes" ] && echo "    (dry run — no requests will be sent)"
echo

# ---------------------------------------------------------------------------
# 1. Organization
# ---------------------------------------------------------------------------

if [ -z "$REF" ]; then
  if [ -z "$ORG_SLUG" ]; then
    echo "==> Looking up your organizations"
    if [ "$DRY_RUN" = "yes" ]; then
      ORG_SLUG="<your-org>"
    else
      api GET "/v1/organizations"
      ORG_COUNT="$(jq 'length' < "$TMP/body")"
      if [ "$ORG_COUNT" -eq 0 ]; then
        echo "Error: this token has access to no organizations."
        echo "Create one at https://supabase.com/dashboard first."
        exit 1
      elif [ "$ORG_COUNT" -gt 1 ]; then
        echo
        echo "Error: your account has $ORG_COUNT organizations. Pick one with --org <slug>:"
        jq -r '.[] | "      \(.slug)  (\(.name))"' < "$TMP/body"
        exit 1
      fi
      ORG_SLUG="$(jq -r '.[0].slug' < "$TMP/body")"
      echo "    Using \"$(jq -r '.[0].name' < "$TMP/body")\" ($ORG_SLUG)"
    fi
  fi

  # ---------------------------------------------------------------------------
  # 2. Create the project
  # ---------------------------------------------------------------------------
  # The database password is resettable later (PATCH /v1/projects/{ref}/database/password),
  # so printing it once is a convenience rather than a one-shot secret. The app never uses
  # it — it is for direct psql access and the connection pooler.
  # Over-generate then trim: stripping the non-alphanumerics out of a 24-byte base64 string
  # can leave fewer than 24 characters, and "usually long enough" is not a property to leave
  # to chance in a password generator. Alphanumeric-only avoids quoting problems in the
  # connection strings people paste this into.
  # A dry run creates no project, so it gets a visible placeholder rather than a real
  # credential — otherwise the run prints a genuine-looking password, into a CI log in the
  # smoke test's case, for an account that will never exist.
  if [ "$DRY_RUN" = "yes" ]; then
    DB_PASS="<generated-at-run-time>"
  else
    DB_PASS="$(openssl rand -base64 48 | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-32)"
  fi

  echo "==> Creating project \"$PROJECT_NAME\" in $REGION"
  jq -n --arg name "$PROJECT_NAME" --arg org "$ORG_SLUG" \
        --arg pass "$DB_PASS" --arg region "$REGION" \
        '{name: $name, organization_slug: $org, db_pass: $pass, region: $region, plan: "free"}' \
        > "$TMP/create.json"
  api POST "/v1/projects" "@$TMP/create.json"

  if [ "$DRY_RUN" = "yes" ]; then
    REF="abcdefghijklmnopqrst"
  else
    REF="$(jq -r '.ref' < "$TMP/body")"
    if [ -z "$REF" ] || [ "$REF" = "null" ]; then
      echo "Error: the API accepted the request but returned no project ref."
      exit 1
    fi
  fi
  echo "    ref: $REF"
  echo
  echo "    Database password (save it — the app does not use it, psql does):"
  echo "        $DB_PASS"
  echo

  # ---------------------------------------------------------------------------
  # 3. Wait for it
  # ---------------------------------------------------------------------------
  if [ "$DRY_RUN" != "yes" ]; then
    echo "==> Waiting for the project to come up (usually ~2 minutes)"
    DEADLINE=$(( $(date +%s) + 600 ))
    while :; do
      # A transient failure mid-poll must not end the run — the project is already created,
      # and a 5xx ten seconds into a two-minute wait is not a reason to make someone resume
      # by hand. Both the call and the parse tolerate it and try again next tick.
      api GET "/v1/projects/$REF" || true
      STATUS="$(jq -r '.status // "UNKNOWN"' < "$TMP/body" 2>/dev/null || echo UNKNOWN)"
      case "$STATUS" in
        ACTIVE_HEALTHY) echo "    $STATUS"; break ;;
        INIT_FAILED|REMOVED)
          echo "Error: the project ended up in state $STATUS."
          echo "Check https://supabase.com/dashboard/project/$REF"
          exit 1 ;;
      esac
      if [ "$(date +%s)" -ge "$DEADLINE" ]; then
        echo
        echo "Error: still $STATUS after 10 minutes. The project exists — resume with:"
        echo "    SUPABASE_ACCESS_TOKEN=... bash scripts/provision-supabase.sh --ref $REF --force"
        exit 1
      fi
      printf '    %s...\r' "$STATUS"
      sleep 10
    done
    echo
  fi
fi

# ---------------------------------------------------------------------------
# 4. Read the publishable key
# ---------------------------------------------------------------------------

echo "==> Reading the project's API keys"
api GET "/v1/projects/$REF/api-keys?reveal=true"

if [ "$DRY_RUN" = "yes" ]; then
  PUBLISHABLE_KEY="sb_publishable_dryrun"
else
  # Prefer a real publishable key; fall back to the legacy `anon` key, which is the same
  # thing under its old name and is still what new projects get in some regions.
  PUBLISHABLE_KEY="$(jq -r '
    (map(select(.type == "publishable")) | .[0].api_key)
    // (map(select(.type == "legacy" and .name == "anon")) | .[0].api_key)
    // empty' < "$TMP/body")"
  if [ -z "$PUBLISHABLE_KEY" ]; then
    echo "Error: no publishable or anon key found on this project."
    echo "Check Project Settings -> API at https://supabase.com/dashboard/project/$REF"
    exit 1
  fi
fi

PROJECT_URL="https://$REF.supabase.co"

# ---------------------------------------------------------------------------
# 5. Write .env.local
# ---------------------------------------------------------------------------

echo "==> Writing .env.local"
if [ "$DRY_RUN" != "yes" ]; then
  python3 - "$PROJECT_URL" "$PUBLISHABLE_KEY" <<'PY'
import sys, os, re

url, key = sys.argv[1], sys.argv[2]
values = {
    "EXPO_PUBLIC_SUPABASE_URL": url,
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY": key,
}

lines = []
if os.path.exists(".env.local"):
    lines = open(".env.local").read().splitlines()

# Upsert rather than append: re-running with --force must repoint the app, not leave two
# conflicting definitions where the later one silently wins.
for name, value in values.items():
    pattern = re.compile(rf"^{name}=")
    for i, line in enumerate(lines):
        if pattern.match(line):
            lines[i] = f"{name}={value}"
            break
    else:
        lines.append(f"{name}={value}")

open(".env.local", "w").write("\n".join(lines).strip() + "\n")
PY
fi
echo "    EXPO_PUBLIC_SUPABASE_URL=$PROJECT_URL"
echo "    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY:0:20}..."
echo

# ---------------------------------------------------------------------------
# 6. Apply the schema
# ---------------------------------------------------------------------------
# schema.sql is idempotent — verify-backend.yml applies it twice on every PR to prove it —
# so re-running this against an existing project is safe.

echo "==> Applying $SCHEMA"
if [ "$DRY_RUN" = "yes" ]; then
  echo "    [dry-run] POST /v1/projects/$REF/database/query  ($(wc -l < "$SCHEMA" | tr -d ' ') lines of SQL)"
else
  jq -Rs '{query: ., read_only: false}' < "$SCHEMA" > "$TMP/schema.json"
  api POST "/v1/projects/$REF/database/query" "@$TMP/schema.json"
  echo "    profiles, RLS policies, signup trigger, delete_own_account(), keepalive_ping()"
fi
echo

# ---------------------------------------------------------------------------
# 7. Prove it actually took
# ---------------------------------------------------------------------------
# A table with policies but RLS disabled is wide open and the dashboard does not warn you.
# The keep-alive grant matters just as quietly: without it supabase-keepalive.yml goes
# green every night while the project drifts toward its 7-day auto-pause.
#
# These are read-only assertions on purpose. scripts/verify-backend-contract.mjs checks
# the same invariants far more thoroughly, but it needs the service_role key and it
# creates and deletes real users — correct against a throwaway local instance, wrong to
# point at the project you just provisioned for production.

echo "==> Verifying"
VERIFY_SQL="select
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.profiles')), false) as rls_enabled,
  (to_regprocedure('public.delete_own_account()') is not null) as has_delete_fn,
  coalesce((select has_function_privilege('anon', to_regprocedure('public.keepalive_ping()'), 'execute')
            where to_regprocedure('public.keepalive_ping()') is not null), false) as anon_can_ping;"

if [ "$DRY_RUN" = "yes" ]; then
  echo "    [dry-run] POST /v1/projects/$REF/database/query  (read_only)"
else
  printf '%s' "$VERIFY_SQL" | jq -Rs '{query: ., read_only: true}' > "$TMP/verify.json"
  api POST "/v1/projects/$REF/database/query" "@$TMP/verify.json"

  check() {
    local field="$1" label="$2" hint="$3"
    if [ "$(jq -r ".[0].$field" < "$TMP/body")" = "true" ]; then
      echo "    ok   $label"
    else
      echo "    FAIL $label"
      echo "         $hint"
      return 1
    fi
  }

  FAILED=0
  check rls_enabled   "RLS is enabled on profiles" \
        "Policies without RLS leave the table world-readable." || FAILED=1
  check has_delete_fn "delete_own_account() exists" \
        "Account deletion silently no-ops without it — a store-compliance failure." || FAILED=1
  check anon_can_ping "anon can execute keepalive_ping()" \
        "supabase-keepalive.yml cannot reach the database; the project will auto-pause." || FAILED=1

  if [ "$FAILED" -ne 0 ]; then
    echo
    echo "Error: the schema applied but the result is not what it should be."
    echo "Re-run the SQL by hand from $SCHEMA and check the SQL editor output."
    exit 1
  fi
fi
echo

# ---------------------------------------------------------------------------
# 8. Auth configuration
# ---------------------------------------------------------------------------

echo "==> Configuring auth"

SCHEME="$(jq -r '.expo.scheme // empty' app.json)"
AUTH_ARGS=(-n)
AUTH_FILTER='{}'

# Tested by SHAPE, not by value. A literal "[APP_SLUG]" here would be rewritten by
# scripts/init.sh along with every other placeholder in every *.sh, turning this into
# `[ "$SCHEME" != "myslug" ]` against an app.json whose scheme IS myslug — inverting
# the guard so that every freshly bootstrapped app, the only kind that still needs
# configuring, silently got no redirect URLs at all.
if [ -n "$SCHEME" ] && ! printf '%s' "$SCHEME" | grep -q '^\[APP_'; then
  # A redirect target that is not on this list produces a browser that opens and never
  # comes back — the single most common way the OAuth recipe fails.
  AUTH_ARGS+=(--arg site "$SCHEME://auth/callback"
              --arg allow "$SCHEME://auth/callback,exp://127.0.0.1:8081/--/auth/callback")
  AUTH_FILTER="$AUTH_FILTER + {site_url: \$site, uri_allow_list: \$allow}"
  echo "    redirect URLs for scheme \"$SCHEME\""
else
  echo "    skipping redirect URLs — app.json scheme is still a placeholder ($SCHEME)."
  echo "    Re-run after scripts/init.sh, or set them in the dashboard."
fi

if [ "$AUTOCONFIRM" = "yes" ]; then
  AUTH_FILTER="$AUTH_FILTER + {mailer_autoconfirm: true}"
  echo "    email confirmation OFF (--autoconfirm)"
fi

if [ -n "$GOOGLE_CLIENT_ID" ]; then
  AUTH_ARGS+=(--arg gid "$GOOGLE_CLIENT_ID" --arg gsecret "$GOOGLE_CLIENT_SECRET")
  AUTH_FILTER="$AUTH_FILTER + {external_google_enabled: true, external_google_client_id: \$gid, external_google_secret: \$gsecret}"
  echo "    Google sign-in enabled"
fi

if [ -n "$APPLE_CLIENT_IDS" ]; then
  AUTH_ARGS+=(--arg appleids "$APPLE_CLIENT_IDS")
  AUTH_FILTER="$AUTH_FILTER + {external_apple_enabled: true, external_apple_client_id: \$appleids}"
  echo "    Apple sign-in enabled"
fi

if [ "$AUTH_FILTER" = "{}" ]; then
  echo "    nothing to change"
else
  jq "${AUTH_ARGS[@]}" "$AUTH_FILTER" > "$TMP/auth.json"
  api PATCH "/v1/projects/$REF/config/auth" "@$TMP/auth.json"
fi
echo

# ---------------------------------------------------------------------------
# 9. CI secrets for the keep-alive workflow
# ---------------------------------------------------------------------------

if [ "$SET_CI_SECRETS" = "yes" ]; then
  echo "==> Setting repo secrets for supabase-keepalive.yml"
  GH="$(command -v gh || echo /opt/homebrew/bin/gh)"
  if [ ! -x "$GH" ]; then
    echo "    gh not found — set these two secrets by hand:"
    echo "        SUPABASE_URL=$PROJECT_URL"
    echo "        SUPABASE_ANON_KEY=<the publishable key above>"
  elif [ "$DRY_RUN" = "yes" ]; then
    echo "    [dry-run] gh secret set SUPABASE_URL / SUPABASE_ANON_KEY"
  else
    # Piped, not --body: an argument is visible to every process on the machine via `ps`.
    printf '%s' "$PROJECT_URL"     | "$GH" secret set SUPABASE_URL
    printf '%s' "$PUBLISHABLE_KEY" | "$GH" secret set SUPABASE_ANON_KEY
    echo "    SUPABASE_URL, SUPABASE_ANON_KEY"
  fi
  echo
fi

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

CHANGED=".env.local"
[ "$DRY_RUN" = "yes" ] && CHANGED="nothing (dry run)"

cat <<EOF
==> Done.

    Project    $PROJECT_URL
    Dashboard  https://supabase.com/dashboard/project/$REF
    Changed    $CHANGED

============================================================
 What is still manual
============================================================
EOF

if [ "$AUTOCONFIRM" != "yes" ]; then
  cat <<'EOF'

Email confirmation is ON (the default). signUp() returns a user but no session, and the
signup screen tells the user to check their inbox. That path is already handled — but
test it, because it is the difference between "signup worked" and "signup looks broken".
EOF
fi

if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$APPLE_CLIENT_IDS" ]; then
  cat <<'EOF'

Social sign-in, if you want it. These steps have no API and cannot be scripted:

  Google  Google Cloud console -> OAuth consent screen, then Credentials -> OAuth
          client ID -> WEB application (not iOS — Supabase does the exchange from its
          own servers and needs a client type that has a secret). Authorised redirect
          URI, exactly:
EOF
  echo "              $PROJECT_URL/auth/v1/callback"
  cat <<'EOF'
          Then re-run this script with --google-client-id and --google-client-secret.

  Apple   Apple Developer -> Identifiers -> your App ID -> enable Sign In with Apple,
          and add "expo-apple-authentication" + "ios.usesAppleSignIn": true to app.json.
          Then re-run with --apple-client-ids <your.bundle.id>.

  App Store guideline 4.8 makes Sign in with Apple mandatory the moment you offer any
  other third-party login, so shipping Google alone is a rejection. Run
  `bash scripts/add-social-auth.sh` to add both to the app.
EOF
fi

if [ "$SET_CI_SECRETS" != "yes" ]; then
  cat <<'EOF'

Free projects auto-pause after 7 days with no database activity.
.github/workflows/supabase-keepalive.yml prevents that, but it skips until two repo
secrets exist. Re-run with --set-ci-secrets, or set them by hand:
EOF
  echo "        SUPABASE_URL=$PROJECT_URL"
  echo "        SUPABASE_ANON_KEY=<the publishable key written to .env.local>"
fi

cat <<EOF

Then verify:
     npm run type-check && npm run lint && npm test
     npx expo start --ios

Full guide: docs/backends/supabase.md
============================================================
EOF
