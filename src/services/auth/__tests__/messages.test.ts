import { authErrorMessage } from "../messages";
import { AuthError } from "../types";
import type { AuthErrorCode } from "../types";

describe("authErrorMessage", () => {
  // `not_wired` is the only code whose message reaches the user verbatim. The
  // social modules rely on it to explain *why* Sign in with Apple is
  // unavailable ("needs a dev build, not Expo Go") — a generic string there
  // would send people looking for a bug that isn't one.
  it("passes not_wired messages through unchanged", () => {
    const message = "Sign in with Apple isn't available on this device.";
    expect(authErrorMessage(new AuthError("not_wired", message))).toBe(message);
  });

  // The store swallows `cancelled` before any screen sees it, so this only
  // fires for a custom screen that renders the error itself. It must not say
  // "Something went wrong" for a sheet the user deliberately dismissed.
  it("describes cancellation without implying failure", () => {
    const message = authErrorMessage(new AuthError("cancelled", "raw provider text"));
    expect(message).toBe("Sign-in was cancelled.");
    expect(message).not.toMatch(/wrong|error|fail/i);
  });

  it.each<AuthErrorCode>([
    "invalid_credentials",
    "email_taken",
    "email_not_confirmed",
    "requires_recent_login",
    "cancelled",
    "network",
    "unknown",
  ])("never leaks the raw provider message for %s", (code) => {
    const raw = "PGRST116: JWT claim sub is missing from schema public";
    expect(authErrorMessage(new AuthError(code, raw))).not.toContain(raw);
  });

  it("falls back to a safe message for a non-AuthError", () => {
    expect(authErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
    expect(authErrorMessage("just a string")).toBe("Something went wrong. Please try again.");
  });
});
