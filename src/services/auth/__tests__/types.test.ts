import { AuthError, isSessionExpired, isValidSession, isValidUser } from "../types";
import type { AuthSession } from "../types";

/**
 * The port's own guards, tested directly.
 *
 * These validate blobs read back from storage — untrusted input, since a
 * partial write or an older app version can leave a malformed shape behind.
 * They are exported from the barrel, so a downstream app may call them even
 * though `local.ts` goes through `loadJson(key, fallback, schema)` instead.
 */

const session = (overrides: Partial<AuthSession> = {}): AuthSession => ({
  accessToken: "token",
  refreshToken: "refresh",
  expiresAt: null,
  user: { id: "1", email: "a@b.c", name: "Ada" },
  ...overrides,
});

describe("isSessionExpired", () => {
  it("treats a null session as expired", () => {
    expect(isSessionExpired(null)).toBe(true);
  });

  it("treats a null expiresAt as never expiring", () => {
    expect(isSessionExpired(session({ expiresAt: null }))).toBe(false);
  });

  it("is false for a future expiry", () => {
    const inAnHour = Math.floor(Date.now() / 1000) + 3600;
    expect(isSessionExpired(session({ expiresAt: inAnHour }))).toBe(false);
  });

  it("is true for a past expiry", () => {
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
    expect(isSessionExpired(session({ expiresAt: anHourAgo }))).toBe(true);
  });

  // The comparison is `<=`, so a token expiring this exact millisecond counts
  // as expired. Boundary pinned because the alternative is a token treated as
  // valid for the one request that is guaranteed to 401.
  it("treats an expiry of exactly now as expired", () => {
    const now = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    expect(isSessionExpired(session({ expiresAt: now / 1000 }))).toBe(true);

    jest.restoreAllMocks();
  });

  // `expiresAt` is epoch *seconds* (matching JWT `exp`), not milliseconds.
  // Comparing the two units directly is the classic version of this bug: a
  // valid seconds-value read as milliseconds lands in 1970 and logs everyone out.
  it("interprets expiresAt as seconds, not milliseconds", () => {
    const nowMs = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(nowMs);

    // One hour ahead expressed in seconds — expired only if misread as ms.
    expect(isSessionExpired(session({ expiresAt: nowMs / 1000 + 3600 }))).toBe(false);

    jest.restoreAllMocks();
  });
});

describe("isValidSession", () => {
  it("accepts a well-formed session", () => {
    expect(isValidSession(session())).toBe(true);
  });

  it("accepts a session with no display name", () => {
    expect(isValidSession(session({ user: { id: "1", email: "a@b.c" } }))).toBe(true);
  });

  it("accepts explicit nulls on both nullable fields", () => {
    expect(isValidSession(session({ refreshToken: null, expiresAt: null }))).toBe(true);
  });

  const malformed: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["a string", "session"],
    ["a number", 1],
    ["an array", []],
    ["an empty object", {}],
    ["a missing accessToken", { ...session(), accessToken: undefined }],
    ["a numeric accessToken", { ...session(), accessToken: 1 }],
    // `.nullable()` and not `.optional()`: an absent key is malformed, not a
    // default. A session missing refreshToken entirely came from a partial
    // write, and trusting it strands the user on a token that cannot refresh.
    ["an absent refreshToken key", { ...session(), refreshToken: undefined }],
    ["an absent expiresAt key", { ...session(), expiresAt: undefined }],
    ["a string expiresAt", { ...session(), expiresAt: "1700000000" }],
    ["a missing user", { ...session(), user: undefined }],
    ["a user with no id", { ...session(), user: { email: "a@b.c" } }],
  ];

  it.each(malformed)("rejects %s", (_label, value) => {
    expect(isValidSession(value)).toBe(false);
  });

  // `name` carries `.catch(undefined)`, so a bad display name must not
  // invalidate an otherwise usable session — losing the name is cosmetic,
  // signing the user out is not.
  it("accepts a session whose display name is the wrong type", () => {
    expect(isValidSession(session({ user: { id: "1", email: "a@b.c", name: 42 as never } }))).toBe(
      true
    );
  });
});

describe("isValidUser", () => {
  it("accepts a well-formed user", () => {
    expect(isValidUser({ id: "1", email: "a@b.c", name: "Ada" })).toBe(true);
  });

  it("accepts a user with no name", () => {
    expect(isValidUser({ id: "1", email: "a@b.c" })).toBe(true);
  });

  // Deliberately `z.string()` and not `z.email()` — this validates a blob
  // already accepted at sign-in, and tightening it would sign out real users
  // whose provider issued an address zod's format check rejects.
  it("accepts an address zod's email format check would reject", () => {
    expect(isValidUser({ id: "1", email: "not-an-email" })).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["a missing id", { email: "a@b.c" }],
    ["a missing email", { id: "1" }],
    ["a numeric id", { id: 1, email: "a@b.c" }],
  ])("rejects %s", (_label, value) => {
    expect(isValidUser(value)).toBe(false);
  });
});

describe("AuthError", () => {
  it("carries its code and is catchable as an Error", () => {
    const error = new AuthError("network", "offline");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AuthError");
    expect(error.code).toBe("network");
    expect(error.message).toBe("offline");
  });

  it("preserves the underlying provider error as cause", () => {
    const cause = new Error("GoTrue exploded");
    expect(new AuthError("unknown", "wrapped", cause).cause).toBe(cause);
  });

  it("leaves cause undefined when none is given", () => {
    expect(new AuthError("cancelled", "user backed out").cause).toBeUndefined();
  });
});
