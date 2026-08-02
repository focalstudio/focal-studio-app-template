#!/usr/bin/env node
/**
 * Verifies the Supabase account-deletion contract against a REAL Postgres + GoTrue.
 *
 * Run by .github/workflows/verify-backend.yml against a local `supabase start`
 * instance that has had templates/backends/supabase/schema.sql applied. Pure Node —
 * no simulator, no device, no test framework.
 *
 * Why this exists: deleteAccount() is unit-tested only against a stubbed provider,
 * yet it is the one claim the app makes on Google Play's Data safety form and
 * Apple's App Privacy questionnaire. A deletion that silently no-ops is
 * indistinguishable from a successful one — which is precisely what the store
 * requirements exist to catch.
 *
 * Every "is it gone?" assertion is made with the service_role key, deliberately.
 * Trusting the RPC's own return value would make the test agree with the bug.
 *
 * Two phases, because phase two is destructive:
 *
 *   node scripts/verify-backend-contract.mjs           # intact schema
 *   <workflow drops delete_own_account() via psql>
 *   node scripts/verify-backend-contract.mjs --broken  # must now fail loudly
 *
 * NOT covered here, deliberately: cold-start session persistence and background
 * token refresh. Those exercise the expo-sqlite/localStorage adapter and the
 * module-scope AppState listener, neither of which exists headlessly. Node could
 * call refreshSession() and go green, but that would prove the Supabase API works,
 * not that our wiring does — a check that proves nothing is worse than no check,
 * because it stops people running the manual test. They live in the Data safety
 * checklist in .claude/reference/store-submission.md instead.
 */

// supabase-js is not a template dependency, deliberately: add-backend.sh installs it into the
// app only when Supabase is actually wired, and verify-backend.yml installs it with `--no-save`
// for this script's benefit alone. Unresolvable here is the correct state — adding it to
// package.json would ship it to every app generated from the template.
// eslint-disable-next-line import/no-unresolved
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Newer CLI releases emit PUBLISHABLE_KEY / SECRET_KEY alongside the legacy names, and are
// expected to drop the legacy ones eventually. Accept either so a CLI bump doesn't break this.
const API_URL = requireEnv("API_URL");
const ANON_KEY = requireEnv("ANON_KEY", "PUBLISHABLE_KEY");
const SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY", "SECRET_KEY");

const BROKEN_PHASE = process.argv.includes("--broken");

// Node has no persistent session store and we want each client independent, so
// every client opts out of persistence and background refresh.
const CLIENT_OPTS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

/** service_role — used ONLY to verify, never to perform the thing under test. */
const admin = createClient(API_URL, SERVICE_ROLE_KEY, CLIENT_OPTS);

let passed = 0;

function requireEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  console.error(
    `::error::None of ${names.join(" / ")} is set. Expected \`supabase status -o env\` to have exported one.`
  );
  process.exit(1);
}

function pass(label) {
  passed += 1;
  console.log(`  ok  ${label}`);
}

function fail(label, detail) {
  console.error(`::error::FAILED — ${label}`);
  if (detail) console.error(`       ${detail}`);
  process.exit(1);
}

function assert(condition, label, detail) {
  if (condition) pass(label);
  else fail(label, detail);
}

/** Signs up a fresh user and returns { uid, client } with the session attached. */
async function createUser() {
  const email = `verify-${randomUUID()}@example.com`;
  const client = createClient(API_URL, ANON_KEY, CLIENT_OPTS);

  const { data, error } = await client.auth.signUp({
    email,
    password: `pw-${randomUUID()}`,
    options: { data: { name: "Contract Test" } },
  });

  if (error) fail("sign up a test user", error.message);
  if (!data.session) {
    fail(
      "sign up returns a session",
      "No session on signUp. Local Supabase should have [auth.email] enable_confirmations = false."
    );
  }

  return { uid: data.user.id, email, client };
}

/** True when the auth user row still exists. Asked with service_role. */
async function userExists(uid) {
  const { data, error } = await admin.auth.admin.getUserById(uid);
  if (error) return false;
  return data?.user?.id === uid;
}

/** Number of profiles rows for a uid. Asked with service_role, so RLS is bypassed. */
async function profileCount(uid) {
  const { data, error } = await admin.from("profiles").select("id").eq("id", uid);
  if (error) fail("query public.profiles as service_role", error.message);
  return data.length;
}

// ---------------------------------------------------------------------------
// Phase 1 — the contract holds on an intact schema
// ---------------------------------------------------------------------------

async function verifyIntact() {
  console.log("Verifying the account-deletion contract against the intact schema:\n");

  // 2. A user can be created, and the on_auth_user_created trigger seeds a profile.
  const { uid, client } = await createUser();
  assert(await userExists(uid), "signup creates a row in auth.users");
  assert(
    (await profileCount(uid)) === 1,
    "handle_new_user() trigger seeded a public.profiles row",
    "No profile row. The on_auth_user_created trigger did not fire, or the insert was swallowed."
  );

  // 3. The authenticated user can call the RPC.
  const { error: rpcError } = await client.rpc("delete_own_account");
  assert(
    rpcError === null,
    "authenticated user can execute delete_own_account()",
    rpcError ? `${rpcError.code ?? "?"}: ${rpcError.message}` : undefined
  );

  // 4. THE assertion. Verified with service_role, not by trusting the RPC's return.
  assert(
    !(await userExists(uid)),
    "the auth.users row is actually gone",
    "delete_own_account() returned success but the user still exists. This is the silent no-op the store requirements target."
  );

  // 5. The `on delete cascade` on profiles.id actually cascaded.
  assert(
    (await profileCount(uid)) === 0,
    "the cascade removed the public.profiles row",
    "The auth user is gone but their profile survived. `on delete cascade` is missing or was dropped — app data outlives the account."
  );

  // 7. anon must not be able to reach the function at all.
  const anon = createClient(API_URL, ANON_KEY, CLIENT_OPTS);
  const { error: anonError } = await anon.rpc("delete_own_account");
  assert(anonError !== null, "anon cannot execute delete_own_account()");
  // Without this second half the assertion passes for the wrong reason: if the
  // `revoke ... from anon` were dropped, anon would still get an error — the
  // function's own `raise exception 'Not authenticated'` — and we would call that
  // a pass while the grant regression went unnoticed.
  assert(
    !/not authenticated/i.test(anonError.message),
    "anon is blocked by the grant, not by the function body",
    `anon reached the function body (error was "${anonError.message}"). ` +
      "`revoke all on function public.delete_own_account() from public, anon` is missing."
  );
}

// ---------------------------------------------------------------------------
// Phase 2 — break it deliberately; the client must NOT see success
// ---------------------------------------------------------------------------

async function verifyBroken() {
  console.log("Verifying that a broken RPC surfaces as an error, not a silent success:\n");

  const { uid, client } = await createUser();

  const { error: rpcError } = await client.rpc("delete_own_account");
  assert(
    rpcError !== null,
    "a dropped delete_own_account() returns an error to the client",
    "The RPC is gone and the client still saw success. Every layer above this — " +
      "supabaseAuthProvider.deleteAccount(), useAuthStore, the Danger Zone UI — would " +
      "report the account as deleted while it still exists."
  );

  // The adapter throws AuthError on any non-null error and only signs out after,
  // so a non-null error here is exactly the propagation path the UI depends on.
  console.log(`      (client saw: ${rpcError.code ?? "?"} — ${rpcError.message})`);

  assert(
    await userExists(uid),
    "the user still exists after the failed call",
    "The RPC was dropped, yet the user vanished — something else is deleting auth users."
  );
}

// ---------------------------------------------------------------------------

const run = BROKEN_PHASE ? verifyBroken : verifyIntact;

run()
  .then(() => {
    console.log(`\n${passed} assertion(s) passed.`);
  })
  .catch((err) => {
    console.error(`::error::Unexpected failure: ${err?.message ?? err}`);
    process.exit(1);
  });
