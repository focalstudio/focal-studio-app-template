import { parseOAuthCallback, googleReversedClientId } from "../oauthCallback";
import { AuthError } from "../types";

/**
 * Callback parsing is the part of the Google flow that fails silently. A
 * mis-read redirect doesn't crash — the browser closes and nothing happens,
 * which is indistinguishable from a dead button. These cases are the ones that
 * actually occur in the wild.
 */
describe("parseOAuthCallback", () => {
  describe("PKCE", () => {
    it("reads the authorization code from the query string", () => {
      expect(parseOAuthCallback("myapp://auth/callback?code=abc123")).toEqual({
        kind: "code",
        code: "abc123",
      });
    });

    it("ignores the other params Supabase appends alongside it", () => {
      expect(
        parseOAuthCallback("myapp://auth/callback?code=abc123&state=xyz&provider=google")
      ).toEqual({ kind: "code", code: "abc123" });
    });

    // Not the documented shape, but some providers and proxies route the code
    // through the fragment. Guessing from the flow you configured is how these
    // bugs happen, so both halves are searched.
    it.each([
      ["bare fragment", "myapp://auth/callback#code=abc123"],
      ["routed fragment", "myapp://auth/callback#/?code=abc123"],
    ])("reads a code delivered in the fragment (%s)", (_label, url) => {
      expect(parseOAuthCallback(url)).toEqual({ kind: "code", code: "abc123" });
    });

    it("percent-decodes the code", () => {
      expect(parseOAuthCallback("myapp://auth/callback?code=a%2Fb%2Bc")).toEqual({
        kind: "code",
        code: "a/b+c",
      });
    });
  });

  describe("implicit", () => {
    it("reads both tokens from the fragment", () => {
      expect(
        parseOAuthCallback(
          "myapp://auth/callback#access_token=at1&refresh_token=rt1&expires_in=3600&token_type=bearer"
        )
      ).toEqual({ kind: "tokens", accessToken: "at1", refreshToken: "rt1" });
    });

    // Supabase's setSession cannot build a durable session from this. Reporting
    // it as a null refreshToken rather than a parse failure lets the caller say
    // so precisely.
    it("returns a null refreshToken when the provider sent none", () => {
      expect(parseOAuthCallback("myapp://auth/callback#access_token=at1")).toEqual({
        kind: "tokens",
        accessToken: "at1",
        refreshToken: null,
      });
    });

    it("treats an empty refresh_token as absent", () => {
      expect(
        parseOAuthCallback("myapp://auth/callback#access_token=at1&refresh_token=")
      ).toEqual({ kind: "tokens", accessToken: "at1", refreshToken: null });
    });

    it("reads a routed fragment", () => {
      expect(
        parseOAuthCallback("myapp://auth/callback#/?access_token=at1&refresh_token=rt1")
      ).toEqual({ kind: "tokens", accessToken: "at1", refreshToken: "rt1" });
    });
  });

  describe("errors", () => {
    // The query/fragment split is the whole point: Supabase puts OAuth errors in
    // the fragment, Google puts them in the query, and an unhandled error is
    // reported to the user as a generic failure of the *next* step.
    it.each([
      [
        "query",
        "myapp://auth/callback?error=server_error&error_description=Database+error+saving+new+user",
      ],
      [
        "fragment",
        "myapp://auth/callback#error=server_error&error_description=Database+error+saving+new+user",
      ],
    ])("reads error_description from the %s", (_label, url) => {
      expect(parseOAuthCallback(url)).toEqual({
        kind: "error",
        code: "unknown",
        message: "Database error saving new user",
      });
    });

    it("percent-decodes error_description", () => {
      expect(
        parseOAuthCallback(
          "myapp://auth/callback?error=invalid_request&error_description=Redirect%20URI%20mismatch"
        )
      ).toEqual({ kind: "error", code: "unknown", message: "Redirect URI mismatch" });
    });

    // Backing out of the consent screen is a deliberate user action. The store
    // swallows `cancelled`, so mapping this correctly is the difference between
    // a silent no-op and "Something went wrong" for a tap the user took back.
    it("maps access_denied to cancelled", () => {
      expect(
        parseOAuthCallback("myapp://auth/callback?error=access_denied")
      ).toEqual({
        kind: "error",
        code: "cancelled",
        message: "access_denied",
      });
    });

    it("falls back to the error code when there is no description", () => {
      expect(parseOAuthCallback("myapp://auth/callback?error=server_error")).toEqual({
        kind: "error",
        code: "unknown",
        message: "server_error",
      });
    });

    // A stale code alongside an error would otherwise be redeemed and fail one
    // step later, with a message pointing at the wrong thing.
    it("prefers the error over a code in the same callback", () => {
      const result = parseOAuthCallback(
        "myapp://auth/callback?code=abc123&error=access_denied"
      );
      expect(result.kind).toBe("error");
    });

    it.each([
      ["no params at all", "myapp://auth/callback"],
      ["an empty query", "myapp://auth/callback?"],
      ["an empty fragment", "myapp://auth/callback#"],
      ["only params we don't use", "myapp://auth/callback?state=xyz"],
      ["an empty code", "myapp://auth/callback?code="],
    ])("reports a callback with %s as an error", (_label, url) => {
      const result = parseOAuthCallback(url);
      expect(result.kind).toBe("error");
      expect(result).toMatchObject({ code: "unknown" });
    });

    // The implicit callback's access token would end up in logs.
    it("does not echo the URL back in the message", () => {
      const result = parseOAuthCallback("myapp://auth/callback?state=secret-value");
      expect(result).toMatchObject({ kind: "error" });
      if (result.kind === "error") expect(result.message).not.toContain("secret-value");
    });
  });

  describe("robustness", () => {
    it("never throws on a malformed percent escape", () => {
      expect(parseOAuthCallback("myapp://auth/callback?code=%zz")).toEqual({
        kind: "code",
        code: "%zz",
      });
    });

    it("lets the fragment win over the query", () => {
      expect(
        parseOAuthCallback("myapp://auth/callback?code=stale#code=fresh")
      ).toEqual({ kind: "code", code: "fresh" });
    });

    // An `exp://` host carries its own port and path; a dev-client redirect is
    // the case people only discover after it works in a standalone build.
    it("handles an Expo Go style redirect", () => {
      expect(
        parseOAuthCallback("exp://192.168.1.10:8081/--/auth/callback?code=abc123")
      ).toEqual({ kind: "code", code: "abc123" });
    });
  });
});

describe("googleReversedClientId", () => {
  it("reverses a client ID", () => {
    expect(googleReversedClientId("123456-abcdef.apps.googleusercontent.com")).toBe(
      "com.googleusercontent.apps.123456-abcdef"
    );
  });

  it("tolerates surrounding whitespace from a copy-paste", () => {
    expect(googleReversedClientId("  123456-abcdef.apps.googleusercontent.com \n")).toBe(
      "com.googleusercontent.apps.123456-abcdef"
    );
  });

  // Returning a scheme here would produce a browser that opens and never comes
  // back, with nothing pointing at the cause.
  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["no suffix", "123456-abcdef"],
    ["already reversed", "com.googleusercontent.apps.123456-abcdef"],
    ["suffix only", ".apps.googleusercontent.com"],
    ["a Supabase URL pasted by mistake", "https://abc.supabase.co"],
  ])("throws not_wired on a malformed client ID (%s)", (_label, clientId) => {
    expect(() => googleReversedClientId(clientId)).toThrow(AuthError);
    try {
      googleReversedClientId(clientId);
    } catch (err) {
      expect((err as AuthError).code).toBe("not_wired");
    }
  });
});
