import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { socialAuth } from "../social";
import { supabase, toAuthError, toAuthSession } from "../supabase";
import { AuthError } from "../types";
import type { AuthSession } from "../types";

/**
 * Contract tests for the Supabase social sign-in module.
 *
 * **This file is authored for its destination, not its home.** It ships at
 * `templates/social/supabase-social.test.ts` and is copied by
 * `scripts/add-social-auth.sh` to `src/services/auth/__tests__/social.test.ts`,
 * next to the module it exercises — which is why `../social`, `../supabase` and
 * `../types` resolve there and not here. `jest.config.js` excludes `/templates/`
 * from `testPathIgnorePatterns` so the un-wired template never tries to run it
 * against native modules it deliberately does not install.
 *
 * **The adapter is mocked here, not the SDK** — the opposite of
 * `supabase.test.ts` next door. There the supabase-js → port mapping *was* the
 * subject. Here the subject is the composition on top of it, and mocking
 * `../supabase` is what makes "reuses the adapter's `toAuthSession` /
 * `toAuthError` rather than growing a second mapping that drifts" something a
 * test can actually assert.
 *
 * `appleNameToPersist` and `parseOAuthCallback` are deliberately left real.
 * Both already have unit coverage in this directory; what has none is the
 * composition around them, and faking them would test nothing.
 */

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(),
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
      updateUser: jest.fn(),
    },
  },
  toAuthSession: jest.fn(),
  toAuthError: jest.fn(),
}));

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
}));

/**
 * Fixed so the redirect URI is comparable byte for byte. The real
 * `createURL` resolves differently per build (`exp://…/--/auth/callback` in Expo
 * Go, `<scheme>://auth/callback` in a dev client), which is exactly why the two
 * call sites must not compute it twice.
 */
const REDIRECT = "focalstudio://auth/callback";
jest.mock("expo-linking", () => ({ createURL: jest.fn(() => "focalstudio://auth/callback") }));

const auth = supabase.auth as unknown as Record<string, jest.Mock>;
const mockToAuthSession = toAuthSession as unknown as jest.Mock;
const mockToAuthError = toAuthError as unknown as jest.Mock;

/** Apple's own cancel code, as `expo-apple-authentication` reports it. */
const APPLE_CANCELED = "ERR_REQUEST_CANCELED";

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

  jest.mocked(AppleAuthentication.isAvailableAsync).mockResolvedValue(true);

  // The adapter's mapping, faked at its own boundary: a truthy SDK session maps
  // to the port shape, null stays null. Tests that care about the mapped value
  // override this.
  mockToAuthSession.mockImplementation((sdkSession: unknown) =>
    sdkSession ? portSession() : null
  );
  mockToAuthError.mockImplementation(
    (err: unknown) => new AuthError("unknown", (err as Error)?.message ?? "boom", err)
  );

  auth.updateUser.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  setPlatform("ios");
});

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------

describe("signInWithApple", () => {
  const okSignIn = () =>
    auth.signInWithIdToken.mockResolvedValue({ data: { session: {} }, error: null });

  it("exchanges the identity token for a session", async () => {
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());
    okSignIn();

    await expect(socialAuth.signInWithApple()).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "apple-identity-token",
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
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  // The whole point of importing the adapter's mapping rather than writing a
  // second one: a provider error must come back with the adapter's code, not a
  // flat "unknown" invented here.
  it("routes a Supabase error through the adapter's toAuthError", async () => {
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());
    const raw = Object.assign(new Error("bad token"), { code: "invalid_credentials" });
    auth.signInWithIdToken.mockResolvedValue({ data: { session: null }, error: raw });
    mockToAuthError.mockReturnValue(new AuthError("invalid_credentials", "bad token", raw));

    await expect(socialAuth.signInWithApple()).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    expect(mockToAuthError).toHaveBeenCalledWith(raw);
  });

  it("throws when the exchange succeeds but yields no session", async () => {
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValue(appleCredential());
    auth.signInWithIdToken.mockResolvedValue({ data: { session: null }, error: null });

    await expect(socialAuth.signInWithApple()).rejects.toMatchObject({ code: "unknown" });
  });
});

/**
 * Apple sends `fullName` **only on the first authorization ever** for a given
 * Apple ID and app pair, and reinstalling does not reset it. There is exactly
 * one chance to store it, so a bug here is unrecoverable per user.
 */
describe("signInWithApple — name capture", () => {
  beforeEach(() => {
    auth.signInWithIdToken.mockResolvedValue({ data: { session: {} }, error: null });
  });

  it("persists the name Apple sends on a first sign-in", async () => {
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue(
        appleCredential({ fullName: { givenName: "Ada", familyName: "Lovelace" } })
      );

    const session = await socialAuth.signInWithApple();

    expect(auth.updateUser).toHaveBeenCalledWith({ data: { name: "Ada Lovelace" } });
    expect(session.user.name).toBe("Ada Lovelace");
  });

  it("writes nothing on a later sign-in, when Apple sends nulls", async () => {
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue(appleCredential({ fullName: { givenName: null, familyName: null } }));

    const session = await socialAuth.signInWithApple();

    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(session.user.name).toBeUndefined();
  });

  // Apple is only a source for the very first sign-in. Overwriting later would
  // replace a name the user has since edited with a stale one.
  it("does not overwrite a name the account already has", async () => {
    mockToAuthSession.mockReturnValue(
      portSession({ user: { id: "user-1", email: "ada@example.com", name: "Ada L." } })
    );
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue(
        appleCredential({ fullName: { givenName: "Ada", familyName: "Lovelace" } })
      );

    const session = await socialAuth.signInWithApple();

    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(session.user.name).toBe("Ada L.");
  });

  /**
   * supabase-js reports API failures by *returning* `{ error }`, it does not
   * throw — so the `try/catch` alone never sees this path. Without the returned
   * check the sign-in would resolve with a session claiming a name that was
   * never written, and the next `getSession()` would silently drop it.
   */
  it("survives a returned updateUser error without claiming the name was saved", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    auth.updateUser.mockResolvedValue({ data: {}, error: new Error("update failed") });
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue(
        appleCredential({ fullName: { givenName: "Ada", familyName: "Lovelace" } })
      );

    const session = await socialAuth.signInWithApple();

    expect(session.user.name).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // A failed name write must never fail the sign-in: the user is already
  // authenticated by this point, and an error here would be a lie.
  it("survives a thrown updateUser failure", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    auth.updateUser.mockRejectedValue(new Error("network down"));
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue(
        appleCredential({ fullName: { givenName: "Ada", familyName: "Lovelace" } })
      );

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
  const okAuthorize = () =>
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" },
      error: null,
    });

  const browserReturns = (url: string) =>
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: "success",
      url,
    } as never);

  /**
   * The redirect URI must be the same string in both places, byte for byte, or
   * `openAuthSessionAsync` never recognises the return and the browser sits
   * there until the user gives up.
   */
  it("hands the same redirect URI to Supabase and to the browser", async () => {
    okAuthorize();
    browserReturns(`${REDIRECT}?code=auth-code`);
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });

    await socialAuth.signInWithGoogle();

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      // Without `skipBrowserRedirect`, supabase-js tries to navigate
      // `window.location` — which does not exist here — so there is no
      // navigation *and* no `data.url` to hand to WebBrowser.
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?x=1",
      REDIRECT
    );
  });

  it("routes an authorize error through the adapter's toAuthError", async () => {
    const raw = new Error("provider not enabled");
    auth.signInWithOAuth.mockResolvedValue({ data: null, error: raw });

    await expect(socialAuth.signInWithGoogle()).rejects.toBeInstanceOf(AuthError);
    expect(mockToAuthError).toHaveBeenCalledWith(raw);
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it("throws when Supabase returns no authorization URL", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

    await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({ code: "unknown" });
  });

  // "cancel" is the user dismissing the sheet, "dismiss" is iOS closing it.
  // Neither is a failure, and collapsing either into an error surfaces a toast
  // for a deliberate back-out.
  it.each(["cancel", "dismiss", "locked"])(
    "maps a %s browser result to AuthError('cancelled')",
    async (type) => {
      okAuthorize();
      jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type } as never);

      await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({ code: "cancelled" });
    }
  );

  /** The PKCE shape — what `flowType: "pkce"` in the adapter produces. */
  it("exchanges a ?code= callback for a session", async () => {
    okAuthorize();
    browserReturns(`${REDIRECT}?code=auth-code&state=xyz`);
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });

    await expect(socialAuth.signInWithGoogle()).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("routes a failed code exchange through the adapter's toAuthError", async () => {
    okAuthorize();
    browserReturns(`${REDIRECT}?code=auth-code`);
    const raw = new Error("code verifier should be non-empty");
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: raw });

    await expect(socialAuth.signInWithGoogle()).rejects.toBeInstanceOf(AuthError);
    expect(mockToAuthError).toHaveBeenCalledWith(raw);
  });

  /**
   * The implicit shape. Only reachable on an app whose adapter predates
   * `flowType: "pkce"` — handled so that upgrading the template does not require
   * editing an adapter the install script promises not to touch. A regression to
   * PKCE-only here would be silent.
   */
  it("restores a session from an implicit #access_token callback", async () => {
    okAuthorize();
    browserReturns(`${REDIRECT}#access_token=at&refresh_token=rt&token_type=bearer`);
    auth.setSession.mockResolvedValue({ data: { session: {} }, error: null });

    await expect(socialAuth.signInWithGoogle()).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  // `setSession` cannot build a durable session without a refresh token, so
  // failing here with an actionable message beats storing something that
  // expires in an hour and never comes back.
  it("refuses an implicit callback with no refresh token, naming the pkce fix", async () => {
    okAuthorize();
    browserReturns(`${REDIRECT}#access_token=at&token_type=bearer`);

    const error = await socialAuth.signInWithGoogle().catch((err: AuthError) => err);

    expect(error).toMatchObject({ code: "unknown" });
    expect((error as AuthError).message).toContain("pkce");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  // `parseOAuthCallback` maps this one, and it is the browser half of the same
  // contract as dismissing Apple's sheet.
  it("maps an access_denied callback to cancelled", async () => {
    okAuthorize();
    browserReturns(`${REDIRECT}?error=access_denied&error_description=User+denied`);

    await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({ code: "cancelled" });
  });

  it("surfaces any other provider error from the callback", async () => {
    okAuthorize();
    browserReturns(`${REDIRECT}?error=server_error&error_description=Boom`);

    await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({
      code: "unknown",
      message: "Boom",
    });
  });

  it("throws when the callback carries neither a code, tokens, nor an error", async () => {
    okAuthorize();
    browserReturns(REDIRECT);

    await expect(socialAuth.signInWithGoogle()).rejects.toMatchObject({ code: "unknown" });
  });

  it("throws when a successful exchange yields no session", async () => {
    okAuthorize();
    browserReturns(`${REDIRECT}?code=auth-code`);
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
    mockToAuthSession.mockReturnValue(null);

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
    const { signInWithApple } = socialAuth;

    await expect(signInWithApple()).rejects.toMatchObject({ code: "not_wired" });
  });
});
