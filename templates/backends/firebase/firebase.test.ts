import * as firebaseAuth from "firebase/auth";
import { firebaseAuthProvider, toAuthError, toAuthSession } from "../firebase";
import { AuthError } from "../types";

/**
 * Contract tests for the Firebase adapter.
 *
 * **This file is authored for its destination, not its home.** It ships at
 * `templates/backends/firebase/firebase.test.ts` and is copied by
 * `scripts/add-backend.sh` to `src/services/auth/__tests__/firebase.test.ts`,
 * next to the adapter it exercises — which is why `../firebase` and `../types`
 * resolve there and not here. `jest.config.js` excludes `/templates/` from
 * `testPathIgnorePatterns` so the un-wired template never tries to run it
 * against SDKs it deliberately does not install.
 *
 * The SDK is mocked rather than the port: the mapping from Firebase shapes onto
 * the `AuthProvider` port in `./types.ts` *is* the thing under test, so there is
 * nothing left to assert if the port is faked. See docs/testing.md.
 */

jest.mock("firebase/app", () => ({
  initializeApp: jest.fn(() => ({ name: "[DEFAULT]" })),
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => ({ name: "[DEFAULT]" })),
}));

jest.mock("firebase/auth", () => ({
  initializeAuth: jest.fn(() => ({ currentUser: null })),
  getReactNativePersistence: jest.fn(() => ({})),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  updateProfile: jest.fn(),
  deleteUser: jest.fn(),
  signOut: jest.fn(),
  onIdTokenChanged: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));

const sdk = jest.mocked(firebaseAuth);

/**
 * Both captured at module scope, before the first `jest.clearAllMocks()`:
 * the adapter builds its `Auth` at import time, and clearing wipes `mock.calls`
 * and `mock.results` (it clears call records, not implementations).
 */
const auth = jest.mocked(firebaseAuth.initializeAuth).mock.results[0].value as {
  currentUser: unknown;
};
const initializeAuthArgs = jest.mocked(firebaseAuth.initializeAuth).mock.calls[0];

/** A Firebase `User`, in the SDK's shape. */
const fbUser = (overrides: Record<string, unknown> = {}) => ({
  uid: "user-1",
  email: "ada@example.com",
  displayName: "Ada",
  refreshToken: "refresh-token",
  getIdTokenResult: jest.fn().mockResolvedValue({
    token: "id-token",
    expirationTime: "2023-11-14T22:13:20.000Z", // epoch 1_700_000_000
  }),
  ...overrides,
});

/** Firebase throws errors carrying an `auth/*` code. */
const fbError = (code: string, message = "boom") => Object.assign(new Error(message), { code });

beforeEach(() => {
  jest.clearAllMocks();
  auth.currentUser = null;
});

describe("toAuthSession", () => {
  it("returns null for a null user, so signed-out is not an error", async () => {
    await expect(toAuthSession(null)).resolves.toBeNull();
  });

  it("maps a Firebase user onto the port's shape", async () => {
    await expect(toAuthSession(fbUser() as never)).resolves.toEqual({
      accessToken: "id-token",
      refreshToken: "refresh-token",
      expiresAt: 1_700_000_000,
      user: { id: "user-1", email: "ada@example.com", name: "Ada" },
    });
  });

  // Firebase reports expiry as an ISO string; the port uses epoch seconds
  // (matching JWT `exp`). Leaving it in milliseconds would put every session
  // ~50 years in the future and defeat `isSessionExpired` entirely.
  it("converts the ISO expirationTime to epoch seconds", async () => {
    const mapped = await toAuthSession(
      fbUser({
        getIdTokenResult: jest.fn().mockResolvedValue({
          token: "t",
          expirationTime: "2024-01-01T00:00:00.000Z",
        }),
      }) as never
    );

    expect(mapped?.expiresAt).toBe(1_704_067_200);
  });

  it("uses the freshly-issued token, not a stale cached one", async () => {
    const user = fbUser();
    await toAuthSession(user as never);

    expect(user.getIdTokenResult).toHaveBeenCalledTimes(1);
  });

  it("maps a null displayName to undefined rather than null", async () => {
    const mapped = await toAuthSession(fbUser({ displayName: null }) as never);
    // `userSchema` types `name` as `string | undefined`; a null would fail
    // validation on the way back out of storage.
    expect(mapped?.user.name).toBeUndefined();
  });

  // Documents actual behaviour rather than asserting a preference: the adapter
  // uses `?? undefined`, which only catches null/undefined, so an empty
  // displayName survives as "". That still satisfies `userSchema` (`z.string()`
  // accepts it), so it is cosmetic — but pin it, because a later switch to `||`
  // would change it silently.
  it("passes an empty displayName through as an empty string", async () => {
    const mapped = await toAuthSession(fbUser({ displayName: "" }) as never);
    expect(mapped?.user.name).toBe("");
  });

  it("coerces a null email to an empty string", async () => {
    const mapped = await toAuthSession(fbUser({ email: null }) as never);
    expect(mapped?.user.email).toBe("");
  });

  it("maps an empty refreshToken to null, not an empty string", async () => {
    const mapped = await toAuthSession(fbUser({ refreshToken: "" }) as never);
    expect(mapped?.refreshToken).toBeNull();
  });
});

describe("toAuthError", () => {
  it.each([
    ["auth/invalid-credential", "invalid_credentials"],
    ["auth/wrong-password", "invalid_credentials"],
    ["auth/user-not-found", "invalid_credentials"],
    ["auth/invalid-email", "invalid_credentials"],
    ["auth/email-already-in-use", "email_taken"],
    ["auth/requires-recent-login", "requires_recent_login"],
    ["auth/network-request-failed", "network"],
  ])("maps %s to %s", (code, expected) => {
    expect(toAuthError(fbError(code)).code).toBe(expected);
  });

  it("falls back to unknown for an unrecognised code", () => {
    expect(toAuthError(fbError("auth/quota-exceeded")).code).toBe("unknown");
  });

  it.each([
    ["a bare Error with no code", new Error("plain")],
    ["a thrown string", "just a string"],
    ["null", null],
    ["undefined", undefined],
  ])("returns an AuthError for %s rather than throwing itself", (_label, thrown) => {
    const mapped = toAuthError(thrown);

    expect(mapped).toBeInstanceOf(AuthError);
    expect(mapped.code).toBe("unknown");
  });

  it("preserves the original error as cause", () => {
    const raw = fbError("auth/wrong-password");
    expect(toAuthError(raw).cause).toBe(raw);
  });
});

/**
 * Firebase restores the persisted user asynchronously, so `auth.currentUser` is
 * still null immediately after startup. The adapter waits for the first
 * auth-state callback instead — reading `currentUser` directly makes every cold
 * start look signed-out for a frame, and the route guards bounce the user to
 * login.
 */
describe("getSession", () => {
  it("resolves null when the first callback reports no user", async () => {
    const unsubscribe = jest.fn();
    sdk.onAuthStateChanged.mockImplementation(((_auth: unknown, next: (u: unknown) => void) => {
      queueMicrotask(() => next(null));
      return unsubscribe;
    }) as never);

    await expect(firebaseAuthProvider.getSession()).resolves.toBeNull();
  });

  it("resolves the mapped session when a user is restored", async () => {
    sdk.onAuthStateChanged.mockImplementation(((_auth: unknown, next: (u: unknown) => void) => {
      queueMicrotask(() => next(fbUser()));
      return jest.fn();
    }) as never);

    await expect(firebaseAuthProvider.getSession()).resolves.toMatchObject({
      accessToken: "id-token",
      user: { id: "user-1" },
    });
  });

  // A listener left alive fires again on every later token refresh, resolving
  // an already-settled promise and leaking for the life of the process.
  it("unsubscribes after the first callback", async () => {
    const unsubscribe = jest.fn();
    sdk.onAuthStateChanged.mockImplementation(((_auth: unknown, next: (u: unknown) => void) => {
      queueMicrotask(() => next(null));
      return unsubscribe;
    }) as never);

    await firebaseAuthProvider.getSession();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("rejects with a mapped AuthError when the observer errors", async () => {
    const unsubscribe = jest.fn();
    sdk.onAuthStateChanged.mockImplementation(((
      _auth: unknown,
      _next: unknown,
      onError: (e: unknown) => void
    ) => {
      queueMicrotask(() => onError(fbError("auth/network-request-failed")));
      return unsubscribe;
    }) as never);

    await expect(firebaseAuthProvider.getSession()).rejects.toMatchObject({
      name: "AuthError",
      code: "network",
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("rejects with a mapped AuthError when the token fetch fails", async () => {
    sdk.onAuthStateChanged.mockImplementation(((_auth: unknown, next: (u: unknown) => void) => {
      queueMicrotask(() =>
        next(
          fbUser({
            getIdTokenResult: jest
              .fn()
              .mockRejectedValue(fbError("auth/network-request-failed")),
          })
        )
      );
      return jest.fn();
    }) as never);

    await expect(firebaseAuthProvider.getSession()).rejects.toMatchObject({
      code: "network",
    });
  });
});

describe("signIn", () => {
  it("returns the mapped session", async () => {
    sdk.signInWithEmailAndPassword.mockResolvedValue({ user: fbUser() } as never);

    await expect(firebaseAuthProvider.signIn("ada@example.com", "pw")).resolves.toMatchObject({
      user: { email: "ada@example.com" },
    });
  });

  it("throws a mapped AuthError on a bad password", async () => {
    sdk.signInWithEmailAndPassword.mockRejectedValue(fbError("auth/wrong-password"));

    await expect(firebaseAuthProvider.signIn("a@b.c", "wrong")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  // The catch re-maps anything that escapes, so an AuthError thrown by the
  // adapter itself must pass through with its code intact rather than being
  // re-wrapped as `unknown`.
  it("does not double-wrap an AuthError it raised itself", async () => {
    sdk.signInWithEmailAndPassword.mockResolvedValue({ user: null } as never);

    await expect(firebaseAuthProvider.signIn("a@b.c", "pw")).rejects.toBeInstanceOf(AuthError);
  });
});

describe("signUp", () => {
  it("sets the display name when one is given", async () => {
    const user = fbUser();
    sdk.createUserWithEmailAndPassword.mockResolvedValue({ user } as never);

    await firebaseAuthProvider.signUp("ada@example.com", "pw", "Ada");

    expect(sdk.updateProfile).toHaveBeenCalledWith(user, { displayName: "Ada" });
  });

  it("skips the profile update when no name is given", async () => {
    sdk.createUserWithEmailAndPassword.mockResolvedValue({ user: fbUser() } as never);

    await firebaseAuthProvider.signUp("ada@example.com", "pw");

    expect(sdk.updateProfile).not.toHaveBeenCalled();
  });

  it("throws email_taken for an existing address", async () => {
    sdk.createUserWithEmailAndPassword.mockRejectedValue(fbError("auth/email-already-in-use"));

    await expect(firebaseAuthProvider.signUp("a@b.c", "pw")).rejects.toMatchObject({
      code: "email_taken",
    });
  });
});

describe("resetPassword / signOut", () => {
  it("resetPassword resolves on success", async () => {
    sdk.sendPasswordResetEmail.mockResolvedValue(undefined);

    await expect(firebaseAuthProvider.resetPassword("a@b.c")).resolves.toBeUndefined();
  });

  it("resetPassword throws a mapped error", async () => {
    sdk.sendPasswordResetEmail.mockRejectedValue(fbError("auth/network-request-failed"));

    await expect(firebaseAuthProvider.resetPassword("a@b.c")).rejects.toMatchObject({
      code: "network",
    });
  });

  it("signOut throws a mapped error rather than resolving silently", async () => {
    sdk.signOut.mockRejectedValue(fbError("auth/network-request-failed"));

    await expect(firebaseAuthProvider.signOut()).rejects.toBeInstanceOf(AuthError);
  });
});

/**
 * The highest-stakes method in the port — this is the claim the app makes on
 * Google Play's Data safety form. It must throw on failure and leave local
 * state alone, because a sign-out with the account still present is
 * indistinguishable from a successful deletion.
 */
describe("deleteAccount", () => {
  it("deletes the currently signed-in user", async () => {
    const user = fbUser();
    auth.currentUser = user;
    sdk.deleteUser.mockResolvedValue(undefined);

    await firebaseAuthProvider.deleteAccount();

    expect(sdk.deleteUser).toHaveBeenCalledWith(user);
  });

  it("throws when there is no signed-in user", async () => {
    auth.currentUser = null;

    await expect(firebaseAuthProvider.deleteAccount()).rejects.toBeInstanceOf(AuthError);
    expect(sdk.deleteUser).not.toHaveBeenCalled();
  });

  // Firebase refuses to delete a session older than roughly five minutes. That
  // has to reach the UI as "please sign in again", not a generic failure.
  it("surfaces a stale session as requires_recent_login", async () => {
    auth.currentUser = fbUser();
    sdk.deleteUser.mockRejectedValue(fbError("auth/requires-recent-login"));

    await expect(firebaseAuthProvider.deleteAccount()).rejects.toMatchObject({
      code: "requires_recent_login",
    });
  });

  it("does not sign out when the delete fails", async () => {
    auth.currentUser = fbUser();
    sdk.deleteUser.mockRejectedValue(fbError("auth/network-request-failed"));

    await expect(firebaseAuthProvider.deleteAccount()).rejects.toThrow();

    expect(sdk.signOut).not.toHaveBeenCalled();
  });
});

/**
 * `onIdTokenChanged` rather than `onAuthStateChanged`: it fires on token
 * refresh as well as sign-in/out, so the stored session's accessToken and
 * expiresAt stay current instead of going stale after the first hour.
 */
describe("subscribe", () => {
  it("subscribes to token changes, not just auth-state changes", () => {
    sdk.onIdTokenChanged.mockReturnValue(jest.fn());

    firebaseAuthProvider.subscribe(jest.fn());

    expect(sdk.onIdTokenChanged).toHaveBeenCalledTimes(1);
    expect(sdk.onAuthStateChanged).not.toHaveBeenCalled();
  });

  it("maps each emitted user and returns the SDK's unsubscribe", async () => {
    const unsubscribe = jest.fn();
    let emit!: (user: unknown) => Promise<void>;
    sdk.onIdTokenChanged.mockImplementation(((_auth: unknown, next: typeof emit) => {
      emit = next;
      return unsubscribe;
    }) as never);
    const onChange = jest.fn();

    const stop = firebaseAuthProvider.subscribe(onChange);
    await emit(fbUser());

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "id-token" }));

    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("emits null on sign-out", async () => {
    let emit!: (user: unknown) => Promise<void>;
    sdk.onIdTokenChanged.mockImplementation(((_auth: unknown, next: typeof emit) => {
      emit = next;
      return jest.fn();
    }) as never);
    const onChange = jest.fn();

    firebaseAuthProvider.subscribe(onChange);
    await emit(null);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  // A token fetch that throws inside the listener would otherwise become an
  // unhandled rejection on a background refresh. Emitting null degrades to
  // signed-out, which the store can act on.
  it("emits null rather than rejecting when the token fetch fails", async () => {
    let emit!: (user: unknown) => Promise<void>;
    sdk.onIdTokenChanged.mockImplementation(((_auth: unknown, next: typeof emit) => {
      emit = next;
      return jest.fn();
    }) as never);
    const onChange = jest.fn();

    firebaseAuthProvider.subscribe(onChange);
    await emit(fbUser({ getIdTokenResult: jest.fn().mockRejectedValue(new Error("offline")) }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("port conformance", () => {
  it("identifies itself", () => {
    expect(firebaseAuthProvider.name).toBe("firebase");
  });

  // `getAuth(app)` in React Native silently falls back to in-memory persistence
  // and signs the user out on every cold start. `initializeAuth` with explicit
  // persistence is the fix, and it is invisible in any test that mocks the port.
  it("initialises auth with explicit persistence, not getAuth", () => {
    const [, options] = initializeAuthArgs;

    // The persistence key must be present and defined. `initializeAuth` without
    // it behaves like `getAuth` — in-memory only.
    expect(options).toEqual(expect.objectContaining({ persistence: expect.anything() }));
  });

  it("omits social sign-in until add-social-auth.sh composes it on", () => {
    expect(firebaseAuthProvider.signInWithApple).toBeUndefined();
    expect(firebaseAuthProvider.signInWithGoogle).toBeUndefined();
  });

  // Social sign-in is composed on by object spread, which does not carry a
  // bound receiver — a method written with `this` breaks the moment it is.
  it("has methods that do not depend on `this`", async () => {
    sdk.onAuthStateChanged.mockImplementation(((_auth: unknown, next: (u: unknown) => void) => {
      queueMicrotask(() => next(null));
      return jest.fn();
    }) as never);
    const { getSession } = firebaseAuthProvider;

    await expect(getSession()).resolves.toBeNull();
  });
});
