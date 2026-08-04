import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSessionApi from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { GoogleAuthProvider, signInWithCredential, updateProfile } from "firebase/auth";
import { socialAuth } from "../social";
import { auth, toAuthError, toAuthSession } from "../firebase";
import { AuthError } from "../types";
import type { AuthSession } from "../types";
import { requireEnv } from "../../../env";

/**
 * Contract tests for the Firebase social sign-in module.
 *
 * **This file is authored for its destination, not its home.** It ships at
 * `templates/social/firebase-social.test.ts` and is copied by
 * `scripts/add-social-auth.sh` to `src/services/auth/__tests__/social.test.ts`,
 * next to the module it exercises — which is why `../social`, `../firebase` and
 * `../types` resolve there and not here. `jest.config.js` excludes `/templates/`
 * from `testPathIgnorePatterns` so the un-wired template never tries to run it
 * against SDKs it deliberately does not install.
 *
 * **The adapter is mocked here, not the SDK** — the opposite of
 * `firebase.test.ts` next door. There the Firebase → port mapping *was* the
 * subject. Here the subject is the composition on top of it, and mocking
 * `../firebase` is what makes "reuses the adapter's `toAuthSession` /
 * `toAuthError` rather than growing a second mapping that drifts" something a
 * test can actually assert.
 *
 * `appleNameToPersist` and `googleReversedClientId` are deliberately left real.
 * Both already have unit coverage in this directory; what has none is the
 * composition around them, and faking them would test nothing.
 */

jest.mock("../firebase", () => ({
  auth: { currentUser: null },
  toAuthSession: jest.fn(),
  toAuthError: jest.fn(),
}));

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

/**
 * The nonce is the one place this recipe differs from the Supabase one, and the
 * difference costs people an afternoon: Apple's sheet is handed SHA-256(raw)
 * while Firebase is handed the RAW value. Fixed outputs here so the tests below
 * can prove the two halves did not get swapped.
 */
jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array([0xde, 0xad, 0x0f])),
  digestStringAsync: jest.fn(async () => "hashed-nonce"),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

/**
 * `AuthRequest` is a class the module instantiates and then reads
 * `codeVerifier` back off, so a plain `jest.fn()` will not do. The constructor
 * configs and a shared `promptAsync` are exposed on `__state` for assertions —
 * a jest factory cannot close over test-file variables.
 */
jest.mock("expo-auth-session", () => {
  const promptAsync = jest.fn();
  const state = {
    configs: [] as Record<string, unknown>[],
    /** Populated by AuthRequest whenever `usePKCE` is true; empty means the request was never prepared. */
    codeVerifier: "code-verifier" as string | undefined,
    promptAsync,
  };

  class AuthRequest {
    codeVerifier: string | undefined;
    promptAsync = promptAsync;

    constructor(config: Record<string, unknown>) {
      state.configs.push(config);
      this.codeVerifier = state.codeVerifier;
    }
  }

  return {
    AuthRequest,
    ResponseType: { Code: "code" },
    exchangeCodeAsync: jest.fn(),
    __state: state,
  };
});

jest.mock("firebase/auth", () => {
  const appleCredential = jest.fn(() => ({ kind: "apple-credential" }));
  const providerIds: string[] = [];

  class OAuthProvider {
    credential = appleCredential;

    constructor(providerId: string) {
      providerIds.push(providerId);
    }
  }

  return {
    OAuthProvider,
    GoogleAuthProvider: { credential: jest.fn(() => ({ kind: "google-credential" })) },
    signInWithCredential: jest.fn(),
    updateProfile: jest.fn(),
    __appleCredential: appleCredential,
    __providerIds: providerIds,
  };
});

jest.mock("../../../env", () => ({
  ...jest.requireActual("../../../env"),
  requireEnv: jest.fn(),
}));

const authSession = AuthSessionApi as unknown as {
  __state: {
    configs: Record<string, unknown>[];
    codeVerifier: string | undefined;
    promptAsync: jest.Mock;
  };
  exchangeCodeAsync: jest.Mock;
};
/** The pieces of the `firebase/auth` mock that have no import to reach them by. */
const firebaseAuthMock = jest.requireMock("firebase/auth") as {
  __appleCredential: jest.Mock;
  __providerIds: string[];
};

const mockToAuthSession = toAuthSession as unknown as jest.Mock;
const mockToAuthError = toAuthError as unknown as jest.Mock;
const mockRequireEnv = requireEnv as unknown as jest.Mock;

/** Apple's own cancel code, as `expo-apple-authentication` reports it. */
const APPLE_CANCELED = "ERR_REQUEST_CANCELED";

const CLIENT_ID = "123-abc.apps.googleusercontent.com";
/** One slash, not two — Google's iOS clients accept exactly this shape. */
const REDIRECT_URI = "com.googleusercontent.apps.123-abc:/oauthredirect";

const portSession = (overrides: Partial<AuthSession> = {}): AuthSession => ({
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: 1_700_000_000,
  user: { id: "user-1", email: "ada@example.com" },
  ...overrides,
});

/** An `AppleAuthenticationCredential`, minus the fields this module ignores. */
const appleCredential = (overrides: Record<string, unknown> = {}) =>
  ({
    identityToken: "apple-identity-token",
    fullName: null,
    ...overrides,
  }) as unknown as AppleAuthentication.AppleAuthenticationCredential;

function setPlatform(os: string) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform("ios");

  authSession.__state.configs.length = 0;
  authSession.__state.codeVerifier = "code-verifier";

  (auth as { currentUser: unknown }).currentUser = { uid: "user-1" };

  jest.mocked(AppleAuthentication.isAvailableAsync).mockResolvedValue(true);
  mockRequireEnv.mockReturnValue(CLIENT_ID);

  // The adapter's mapping, faked at its own boundary. Async here — unlike the
  // Supabase adapter's, `toAuthSession` on this backend awaits an ID token.
  mockToAuthSession.mockImplementation(async (user: unknown) => (user ? portSession() : null));
  mockToAuthError.mockImplementation(
    (err: unknown) => new AuthError("unknown", (err as Error)?.message ?? "boom", err)
  );

  jest.mocked(signInWithCredential).mockResolvedValue({ user: { uid: "user-1" } } as never);
  jest.mocked(updateProfile).mockResolvedValue(undefined);
});

afterEach(() => {
  setPlatform("ios");
});

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------

describe("signInWithApple", () => {
  it("exchanges the identity token for a session", async () => {
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());

    await expect(socialAuth.signInWithApple()).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(signInWithCredential).toHaveBeenCalledTimes(1);
  });

  /**
   * Apple's sheet gets SHA-256(raw); Firebase gets the RAW value and hashes it
   * itself. Hand either side the other's and Firebase rejects the credential
   * with `auth/invalid-credential` — a message that points nowhere near the
   * cause. `0xde 0xad 0x0f` from the mocked RNG is "dead0f" in lowercase hex,
   * which is the encoding Firebase hashes to.
   */
  it("sends the hashed nonce to Apple and the raw nonce to Firebase", async () => {
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());

    await socialAuth.signInWithApple();

    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: "hashed-nonce" })
    );
    expect(Crypto.digestStringAsync).toHaveBeenCalledWith("SHA-256", "dead0f");
    expect(firebaseAuthMock.__appleCredential).toHaveBeenCalledWith({
      idToken: "apple-identity-token",
      rawNonce: "dead0f",
    });
  });

  it("builds the credential against the apple.com provider", async () => {
    firebaseAuthMock.__providerIds.length = 0;
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());

    await socialAuth.signInWithApple();

    expect(firebaseAuthMock.__providerIds).toEqual(["apple.com"]);
    expect(jest.mocked(signInWithCredential).mock.calls[0][1]).toEqual({
      kind: "apple-credential",
    });
  });

  /**
   * The case this whole file exists for. `useAuthStore` swallows `cancelled`,
   * so mapping a dismissed sheet to anything else shows the user a red error
   * for a tap they deliberately took back — and no structural grep can see it.
   */
  it("maps Apple's cancel code to AuthError('cancelled'), not unknown", async () => {
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockRejectedValue(Object.assign(new Error("The user canceled"), { code: APPLE_CANCELED }));

    await expect(socialAuth.signInWithApple()).rejects.toMatchObject({
      name: "AuthError",
      code: "cancelled",
    });
  });

  it("maps any other sheet failure to unknown, keeping the original as cause", async () => {
    const raw = Object.assign(new Error("sheet exploded"), { code: "ERR_SOMETHING_ELSE" });
    jest.mocked(AppleAuthentication.signInAsync).mockRejectedValue(raw);

    const error = await socialAuth.signInWithApple().catch((err: AuthError) => err);

    expect(error).toMatchObject({ code: "unknown", message: "sheet exploded" });
    expect((error as AuthError).cause).toBe(raw);
  });

  it("refuses when Apple sign-in is unavailable on this platform", async () => {
    setPlatform("android");

    await expect(socialAuth.signInWithApple()).rejects.toMatchObject({ code: "not_wired" });
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
  });

  /**
   * `isAvailableAsync()` throws rather than returning false in Expo Go, where
   * the native module is absent entirely. Checking without catching turns a
   * "needs a dev build" message into an unhandled rejection.
   */
  it("treats isAvailableAsync throwing as unavailable rather than crashing", async () => {
    jest
      .mocked(AppleAuthentication.isAvailableAsync)
      .mockRejectedValue(new Error("ExpoAppleAuthentication is not available"));

    await expect(socialAuth.signInWithApple()).rejects.toMatchObject({ code: "not_wired" });
  });

  it("throws when Apple returns no identity token", async () => {
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue(appleCredential({ identityToken: null }));

    await expect(socialAuth.signInWithApple()).rejects.toMatchObject({ code: "unknown" });
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  // The whole point of importing the adapter's mapping rather than writing a
  // second one: a provider error must come back with the adapter's code, not a
  // flat "unknown" invented here.
  it("routes a Firebase error through the adapter's toAuthError", async () => {
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());
    const raw = Object.assign(new Error("bad credential"), { code: "auth/invalid-credential" });
    jest.mocked(signInWithCredential).mockRejectedValue(raw);
    mockToAuthError.mockReturnValue(new AuthError("invalid_credentials", "bad credential", raw));

    await expect(socialAuth.signInWithApple()).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    expect(mockToAuthError).toHaveBeenCalledWith(raw);
  });

  it("throws when the exchange succeeds but the adapter maps no session", async () => {
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());
    mockToAuthSession.mockResolvedValue(null);

    await expect(socialAuth.signInWithApple()).rejects.toMatchObject({ code: "unknown" });
  });

  /**
   * The client ID is read *inside* `signInWithGoogle`, never at module scope, so
   * an app that wants Apple sign-in and not Google does not fail at import time
   * and take the whole auth provider down with it.
   */
  it("works with no Google client ID configured", async () => {
    mockRequireEnv.mockImplementation(() => {
      throw new Error("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set");
    });
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());

    await expect(socialAuth.signInWithApple()).resolves.toMatchObject({
      accessToken: "access-token",
    });
  });
});

/**
 * Apple sends `fullName` **only on the first authorization ever** for a given
 * Apple ID and app pair, and reinstalling does not reset it. Firebase does not
 * populate `displayName` from an Apple credential on its own, so this is the
 * only thing standing between you and a permanently nameless user record.
 */
describe("signInWithApple — name capture", () => {
  const withName = () =>
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue(
        appleCredential({ fullName: { givenName: "Ada", familyName: "Lovelace" } })
      );

  it("persists the name Apple sends on a first sign-in", async () => {
    withName();

    const session = await socialAuth.signInWithApple();

    expect(updateProfile).toHaveBeenCalledWith({ uid: "user-1" }, { displayName: "Ada Lovelace" });
    expect(session.user.name).toBe("Ada Lovelace");
  });

  it("writes nothing on a later sign-in, when Apple sends nulls", async () => {
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue(appleCredential({ fullName: { givenName: null, familyName: null } }));

    const session = await socialAuth.signInWithApple();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(session.user.name).toBeUndefined();
  });

  // Apple is only a source for the very first sign-in. Overwriting later would
  // replace a name the user has since edited with a stale one.
  it("does not overwrite a name the account already has", async () => {
    mockToAuthSession.mockResolvedValue(
      portSession({ user: { id: "user-1", email: "ada@example.com", name: "Ada L." } })
    );
    withName();

    const session = await socialAuth.signInWithApple();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(session.user.name).toBe("Ada L.");
  });

  it("returns the session unchanged when there is no current user to write to", async () => {
    (auth as { currentUser: unknown }).currentUser = null;
    withName();

    const session = await socialAuth.signInWithApple();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(session.user.name).toBeUndefined();
  });

  // A failed name write must never fail the sign-in: the user is already
  // authenticated by this point, and an error here would be a lie.
  it("survives a failed profile update", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.mocked(updateProfile).mockRejectedValue(new Error("network down"));
    withName();

    await expect(socialAuth.signInWithApple()).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

describe("signInWithGoogle", () => {
  const promptReturns = (result: unknown) =>
    authSession.__state.promptAsync.mockResolvedValue(result);

  const okExchange = () =>
    authSession.exchangeCodeAsync.mockResolvedValue({
      idToken: "google-id-token",
      accessToken: "google-access-token",
    });

  const succeed = () => {
    promptReturns({ type: "success", params: { code: "auth-code" } });
    okExchange();
  };

  /**
   * Android needs its own OAuth client keyed to the package name and the signing
   * certificate's SHA-1, which differs between a local build, EAS, and Play App
   * Signing. Sending the iOS client ID from Android fails with an opaque
   * `redirect_uri_mismatch`, so refuse with something actionable instead.
   */
  it("refuses on Android with an actionable not_wired error", async () => {
    setPlatform("android");

    const error = await socialAuth.signInWithGoogle().catch((err: AuthError) => err);

    expect(error).toMatchObject({ code: "not_wired" });
    expect((error as AuthError).message).toContain("firebase.md");
    expect(mockRequireEnv).not.toHaveBeenCalled();
  });

  /**
   * The redirect URI is derived from the client ID rather than taken as a second
   * environment variable, so the two cannot drift — and drift here fails as a
   * browser that opens and never returns, with nothing pointing at the cause.
   */
  it("derives the reversed-client-ID redirect URI and requests a PKCE code", async () => {
    succeed();

    await socialAuth.signInWithGoogle();

    expect(authSession.__state.configs[0]).toEqual({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scopes: ["openid", "profile", "email"],
      responseType: "code",
      usePKCE: true,
    });
  });

  it("rejects a client ID that is not a Google client ID", async () => {
    mockRequireEnv.mockReturnValue("not-a-client-id");

    await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({ code: "not_wired" });
  });

  // Backing out of Google's consent screen is a deliberate user action. The
  // store swallows `cancelled`, so collapsing either of these into an error
  // shows a toast for a tap the user took back.
  it.each(["cancel", "dismiss"])("maps a %s prompt result to cancelled", async (type) => {
    promptReturns({ type });

    await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({ code: "cancelled" });
  });

  it("keeps a real prompt error distinct from a cancellation", async () => {
    promptReturns({ type: "error", error: { message: "invalid_client" } });

    await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({
      code: "unknown",
      message: "invalid_client",
    });
  });

  it("reports an unexpected prompt result type rather than falling through", async () => {
    promptReturns({ type: "locked" });

    const error = await socialAuth.signInWithGoogle().catch((err: AuthError) => err);

    expect(error).toMatchObject({ code: "unknown" });
    expect((error as AuthError).message).toContain("locked");
  });

  it("exchanges the code with the PKCE verifier and signs in", async () => {
    succeed();

    await expect(socialAuth.signInWithGoogle()).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(authSession.exchangeCodeAsync).toHaveBeenCalledWith(
      {
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        code: "auth-code",
        extraParams: { code_verifier: "code-verifier" },
      },
      expect.objectContaining({ tokenEndpoint: "https://oauth2.googleapis.com/token" })
    );
    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith(
      "google-id-token",
      "google-access-token"
    );
  });

  /**
   * Google answers a missing or empty half of the exchange with the same generic
   * `invalid_grant` it uses for a genuinely wrong verifier — an error that sends
   * you looking at your PKCE implementation when the real problem is a parameter
   * that never arrived. Both halves are checked here instead.
   */
  it("throws when a successful prompt carried no authorization code", async () => {
    promptReturns({ type: "success", params: {} });

    const error = await socialAuth.signInWithGoogle().catch((err: AuthError) => err);

    expect(error).toMatchObject({ code: "unknown" });
    expect((error as AuthError).message).toContain("no authorization code");
    expect(authSession.exchangeCodeAsync).not.toHaveBeenCalled();
  });

  it("throws when the PKCE code verifier was never prepared", async () => {
    authSession.__state.codeVerifier = undefined;
    succeed();

    const error = await socialAuth.signInWithGoogle().catch((err: AuthError) => err);

    expect(error).toMatchObject({ code: "unknown" });
    expect((error as AuthError).message).toContain("code verifier");
    expect(authSession.exchangeCodeAsync).not.toHaveBeenCalled();
  });

  it("throws when Google returns no ID token", async () => {
    promptReturns({ type: "success", params: { code: "auth-code" } });
    authSession.exchangeCodeAsync.mockResolvedValue({ accessToken: "at", idToken: null });

    const error = await socialAuth.signInWithGoogle().catch((err: AuthError) => err);

    expect(error).toMatchObject({ code: "unknown" });
    expect((error as AuthError).message).toContain("no ID token");
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  // The catch around the exchange must not re-wrap an AuthError this module
  // threw itself — `toAuthError` would flatten its code to unknown.
  it("does not re-map an AuthError raised inside the exchange block", async () => {
    promptReturns({ type: "success", params: { code: "auth-code" } });
    authSession.exchangeCodeAsync.mockResolvedValue({ accessToken: "at", idToken: null });

    await expect(socialAuth.signInWithGoogle()).rejects.toBeInstanceOf(AuthError);
    expect(mockToAuthError).not.toHaveBeenCalled();
  });

  it("routes a Firebase sign-in failure through the adapter's toAuthError", async () => {
    succeed();
    const raw = Object.assign(new Error("no iOS app registered"), {
      code: "auth/invalid-credential",
    });
    jest.mocked(signInWithCredential).mockRejectedValue(raw);

    await expect(socialAuth.signInWithGoogle()).rejects.toBeInstanceOf(AuthError);
    expect(mockToAuthError).toHaveBeenCalledWith(raw);
  });

  it("throws when the adapter maps no session", async () => {
    succeed();
    mockToAuthSession.mockResolvedValue(null);

    await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({ code: "unknown" });
  });
});

describe("port conformance", () => {
  it("implements both social methods", () => {
    expect(typeof socialAuth.signInWithApple).toBe("function");
    expect(typeof socialAuth.signInWithGoogle).toBe("function");
  });

  /**
   * `add-social-auth.sh` composes this module onto the adapter by object
   * spread, which carries no bound receiver — a method written with `this`
   * breaks the moment it is installed, and never before.
   */
  it("has methods that do not depend on `this`", async () => {
    setPlatform("android");
    const { signInWithApple, signInWithGoogle } = socialAuth;

    await expect(signInWithApple()).rejects.toMatchObject({ code: "not_wired" });
    await expect(signInWithGoogle()).rejects.toMatchObject({ code: "not_wired" });
  });
});
