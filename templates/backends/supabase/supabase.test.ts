import { createClient } from "@supabase/supabase-js";
import { supabaseAuthProvider, toAuthError, toAuthSession } from "../supabase";
import { AuthError } from "../types";

/**
 * Contract tests for the Supabase adapter.
 *
 * **This file is authored for its destination, not its home.** It ships at
 * `templates/backends/supabase/supabase.test.ts` and is copied by
 * `scripts/add-backend.sh` to `src/services/auth/__tests__/supabase.test.ts`,
 * next to the adapter it exercises — which is why `../supabase` and `../types`
 * resolve there and not here. `jest.config.js` excludes `/templates/` from
 * `testPathIgnorePatterns` so the un-wired template never tries to run it
 * against SDKs it deliberately does not install.
 *
 * What this covers that `verify-backend.yml` cannot: that workflow proves the
 * *database* contract against a real Postgres + GoTrue (schema, cascade,
 * deletion surfacing errors). This proves the *client* contract — the mapping
 * from supabase-js shapes onto the `AuthProvider` port in `./types.ts`, which
 * never touches a database.
 *
 * The SDK is mocked here rather than the port. Everywhere else in this suite
 * adapters are faked at the port; an adapter test is the one place that cannot
 * do that, because the mapping *is* the thing under test. See docs/testing.md.
 */

jest.mock("@supabase/supabase-js", () => {
  const client = {
    auth: {
      getSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
    rpc: jest.fn(),
  };
  return { createClient: jest.fn(() => client) };
});

/**
 * Captured once, at module scope: `createClient` runs when `../supabase` is
 * imported, and `jest.clearAllMocks()` below wipes `mock.results` (it clears
 * call records, not implementations) — so reading it per-test would find
 * nothing.
 */
const client = jest.mocked(createClient).mock.results[0].value as {
  auth: Record<string, jest.Mock>;
  rpc: jest.Mock;
};

/** A supabase-js session, in the SDK's snake_case shape. */
const sdkSession = (overrides: Record<string, unknown> = {}) => ({
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_at: 1_700_000_000,
  user: {
    id: "user-1",
    email: "ada@example.com",
    user_metadata: { name: "Ada" },
  },
  ...overrides,
});

/** Builds the `{ code, status, name, message }` shape supabase-js throws. */
const sdkError = (fields: Partial<Record<string, unknown>> = {}) =>
  Object.assign(new Error((fields.message as string) ?? "boom"), fields);

beforeEach(() => {
  jest.clearAllMocks();
  client.auth.signOut.mockResolvedValue({ error: null });
});

describe("toAuthSession", () => {
  it("returns null for a null session, so signed-out is not an error", () => {
    expect(toAuthSession(null)).toBeNull();
  });

  it("maps supabase-js snake_case onto the port's shape", () => {
    expect(toAuthSession(sdkSession() as never)).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1_700_000_000,
      user: { id: "user-1", email: "ada@example.com", name: "Ada" },
    });
  });

  // The port documents expiresAt as epoch *seconds*, matching JWT `exp`.
  // supabase-js already uses seconds, so this must pass through unscaled —
  // multiplying by 1000 here would make every session look valid for 50 years.
  it("passes expires_at through as seconds", () => {
    const mapped = toAuthSession(sdkSession({ expires_at: 1_700_000_000 }) as never);
    expect(mapped?.expiresAt).toBe(1_700_000_000);
  });

  it.each([
    ["user_metadata.name", { name: "Ada" }, "Ada"],
    ["user_metadata.full_name when name is absent", { full_name: "Ada Lovelace" }, "Ada Lovelace"],
    ["name over full_name when both are present", { name: "Ada", full_name: "Ada L" }, "Ada"],
    ["undefined when neither is present", {}, undefined],
  ])("resolves the display name from %s", (_label, metadata, expected) => {
    const mapped = toAuthSession(
      sdkSession({ user: { id: "u", email: "a@b.c", user_metadata: metadata } }) as never
    );
    expect(mapped?.user.name).toBe(expected);
  });

  it("coerces a missing email to an empty string rather than undefined", () => {
    const mapped = toAuthSession(
      sdkSession({ user: { id: "u", email: null, user_metadata: {} } }) as never
    );
    // `userSchema` requires a string; undefined here would fail validation on
    // the way back out of storage and silently sign the user out.
    expect(mapped?.user.email).toBe("");
  });

  it.each([
    ["refresh_token", "refreshToken"],
    ["expires_at", "expiresAt"],
  ])("maps an absent %s to null, not undefined", (sdkKey, portKey) => {
    const mapped = toAuthSession(sdkSession({ [sdkKey]: undefined }) as never);
    // `authSessionSchema` uses `.nullable()`, not `.optional()` — undefined
    // fails validation and the persisted session is discarded.
    expect(mapped?.[portKey as "refreshToken" | "expiresAt"]).toBeNull();
  });
});

describe("toAuthError", () => {
  it.each([
    ["invalid_credentials", "invalid_credentials"],
    ["invalid_grant", "invalid_credentials"],
    ["email_not_confirmed", "email_not_confirmed"],
    ["user_already_exists", "email_taken"],
    ["email_exists", "email_taken"],
    ["reauthentication_needed", "requires_recent_login"],
  ])("maps the %s code to %s", (code, expected) => {
    expect(toAuthError(sdkError({ code, status: 400 }) as never).code).toBe(expected);
  });

  // supabase-js surfaces offline and DNS failures as AuthRetryableFetchError
  // with no status. Mapping these to invalid_credentials would tell an offline
  // user their password is wrong.
  it("maps AuthRetryableFetchError to network", () => {
    const error = sdkError({ message: "Failed to fetch" });
    error.name = "AuthRetryableFetchError";
    expect(toAuthError(error as never).code).toBe("network");
  });

  it("maps a missing status to network", () => {
    expect(toAuthError(sdkError({ status: undefined }) as never).code).toBe("network");
  });

  it.each([400, 401])("maps an unrecognised code with status %s to invalid_credentials", (status) => {
    expect(toAuthError(sdkError({ code: "something_new", status }) as never).code).toBe(
      "invalid_credentials"
    );
  });

  it("falls back to unknown for an unrecognised code with another status", () => {
    expect(toAuthError(sdkError({ code: "teapot", status: 418 }) as never).code).toBe("unknown");
  });

  it("always returns an AuthError, never the raw provider error", () => {
    const raw = sdkError({ code: "invalid_credentials", status: 400 });
    const mapped = toAuthError(raw as never);

    expect(mapped).toBeInstanceOf(AuthError);
    expect(mapped).not.toBe(raw);
    // Kept as `cause` so the original is still diagnosable in logs.
    expect(mapped.cause).toBe(raw);
  });
});

describe("getSession", () => {
  // Rule 1 of the port's getSession contract: with nothing persisted, resolve
  // null. Never throw because the device happens to be offline while signed
  // out — that strands a fresh install on the retry screen instead of
  // onboarding.
  it("resolves null when nothing is persisted", async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(supabaseAuthProvider.getSession()).resolves.toBeNull();
  });

  it("returns the mapped session when one is persisted", async () => {
    client.auth.getSession.mockResolvedValue({
      data: { session: sdkSession() },
      error: null,
    });

    await expect(supabaseAuthProvider.getSession()).resolves.toMatchObject({
      accessToken: "access-token",
      user: { id: "user-1" },
    });
  });

  // Rule 2: a network throw is read one level up by `useAuthStore.hydrate()` as
  // "there is a session here I could not verify", which blocks on a retry
  // screen rather than guessing.
  it("throws AuthError('network') when refreshing an existing session fails offline", async () => {
    const error = sdkError({ message: "Failed to fetch" });
    error.name = "AuthRetryableFetchError";
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error });

    await expect(supabaseAuthProvider.getSession()).rejects.toMatchObject({
      name: "AuthError",
      code: "network",
    });
  });
});

describe("signIn", () => {
  it("returns the mapped session", async () => {
    client.auth.signInWithPassword.mockResolvedValue({
      data: { session: sdkSession() },
      error: null,
    });

    await expect(supabaseAuthProvider.signIn("ada@example.com", "pw")).resolves.toMatchObject({
      user: { email: "ada@example.com" },
    });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "pw",
    });
  });

  it("throws a mapped AuthError on a bad password", async () => {
    client.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: sdkError({ code: "invalid_credentials", status: 400 }),
    });

    await expect(supabaseAuthProvider.signIn("a@b.c", "wrong")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  // The port types signIn as returning a session, never null — so a
  // no-error/no-session response has to become an error here rather than a
  // null that every caller would have to re-check.
  it("throws rather than returning null when no session comes back", async () => {
    client.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(supabaseAuthProvider.signIn("a@b.c", "pw")).rejects.toBeInstanceOf(AuthError);
  });
});

describe("signUp", () => {
  it("passes the display name through as user metadata", async () => {
    client.auth.signUp.mockResolvedValue({ data: { session: sdkSession() }, error: null });

    await supabaseAuthProvider.signUp("ada@example.com", "pw", "Ada");

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "pw",
      options: { data: { name: "Ada" } },
    });
  });

  it("omits options entirely when no name is given", async () => {
    client.auth.signUp.mockResolvedValue({ data: { session: sdkSession() }, error: null });

    await supabaseAuthProvider.signUp("ada@example.com", "pw");

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "pw",
      options: undefined,
    });
  });

  // With "Confirm email" enabled — the Supabase default — sign-up succeeds and
  // returns a user but no session. The port's contract is to return null so the
  // UI can say "check your inbox", not to treat it as a failure.
  it("returns null when the provider requires email confirmation", async () => {
    client.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });

    await expect(supabaseAuthProvider.signUp("a@b.c", "pw")).resolves.toBeNull();
  });

  it("throws email_taken for an existing address", async () => {
    client.auth.signUp.mockResolvedValue({
      data: { session: null },
      error: sdkError({ code: "email_exists", status: 422 }),
    });

    await expect(supabaseAuthProvider.signUp("a@b.c", "pw")).rejects.toMatchObject({
      code: "email_taken",
    });
  });
});

describe("resetPassword / signOut", () => {
  it("resetPassword resolves on success", async () => {
    client.auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    await expect(supabaseAuthProvider.resetPassword("a@b.c")).resolves.toBeUndefined();
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.c");
  });

  it("resetPassword throws a mapped error", async () => {
    client.auth.resetPasswordForEmail.mockResolvedValue({
      error: sdkError({ status: undefined }),
    });

    await expect(supabaseAuthProvider.resetPassword("a@b.c")).rejects.toMatchObject({
      code: "network",
    });
  });

  it("signOut throws a mapped error rather than resolving silently", async () => {
    client.auth.signOut.mockResolvedValue({ error: sdkError({ status: 500 }) });

    await expect(supabaseAuthProvider.signOut()).rejects.toBeInstanceOf(AuthError);
  });
});

/**
 * The highest-stakes method in the port. `deleteAccount()` is the claim the app
 * makes on Google Play's Data safety form: signing a user out while their
 * account still exists is indistinguishable, from the app's side, from a
 * successful deletion.
 */
describe("deleteAccount", () => {
  it("calls the SECURITY DEFINER RPC, never the admin API", async () => {
    client.rpc.mockResolvedValue({ error: null });

    await supabaseAuthProvider.deleteAccount();

    // The admin API needs the service_role key, which must never ship in an app.
    expect(client.rpc).toHaveBeenCalledWith("delete_own_account");
  });

  it("throws when the RPC fails", async () => {
    client.rpc.mockResolvedValue({ error: sdkError({ message: "rpc exploded" }) });

    await expect(supabaseAuthProvider.deleteAccount()).rejects.toBeInstanceOf(AuthError);
  });

  it("does NOT sign out when the RPC fails — local state must survive", async () => {
    client.rpc.mockResolvedValue({ error: sdkError({ message: "rpc exploded" }) });

    await expect(supabaseAuthProvider.deleteAccount()).rejects.toThrow();

    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  // Scope matters: a plain signOut() here fails with "User from sub claim in
  // JWT does not exist" — the user is already gone server-side — and that error
  // would surface to the user as a failed deletion.
  it("signs out local-only after a successful delete", async () => {
    client.rpc.mockResolvedValue({ error: null });

    await supabaseAuthProvider.deleteAccount();

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("subscribe", () => {
  it("maps each emitted session and returns its own unsubscribe", () => {
    const unsubscribe = jest.fn();
    let emit!: (event: string, session: unknown) => void;
    client.auth.onAuthStateChange.mockImplementation((cb: typeof emit) => {
      emit = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    const onChange = jest.fn();

    const stop = supabaseAuthProvider.subscribe(onChange);
    emit("TOKEN_REFRESHED", sdkSession());

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token" })
    );

    // The port requires subscribe() to return its own unsubscribe — returning
    // the SDK's subscription object instead leaves a listener alive forever.
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("emits null on sign-out", () => {
    client.auth.onAuthStateChange.mockImplementation((cb: (e: string, s: unknown) => void) => {
      cb("SIGNED_OUT", null);
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    const onChange = jest.fn();

    supabaseAuthProvider.subscribe(onChange);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("port conformance", () => {
  it("identifies itself", () => {
    expect(supabaseAuthProvider.name).toBe("supabase");
  });

  // Social sign-in is opt-in via `scripts/add-social-auth.sh`. Omitting the
  // methods is what makes the UI report "not configured" rather than render a
  // dead button, so their absence is contract, not oversight.
  it("omits social sign-in until add-social-auth.sh composes it on", () => {
    expect(supabaseAuthProvider.signInWithApple).toBeUndefined();
    expect(supabaseAuthProvider.signInWithGoogle).toBeUndefined();
  });

  // Social sign-in is composed on by object spread, which does not carry a
  // bound receiver — a method written with `this` breaks the moment it is.
  it("has methods that do not depend on `this`", async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { getSession } = supabaseAuthProvider;

    await expect(getSession()).resolves.toBeNull();
  });
});
