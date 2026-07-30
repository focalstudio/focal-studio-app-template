import { AuthError } from "./types";

/**
 * Maps an auth failure to something safe to show a user.
 *
 * Never render a provider's raw error: Supabase and Firebase both surface
 * internal database and JWT text that leaks implementation detail and reads as
 * gibberish. Branch on `AuthError.code` instead.
 *
 * `not_wired` is the exception — it can only fire in a template that hasn't
 * been connected to a backend yet, so it says exactly what to do.
 */
export function authErrorMessage(err: unknown): string {
  if (err instanceof AuthError) {
    switch (err.code) {
      case "not_wired":
        return err.message;
      case "invalid_credentials":
        return "Invalid email or password.";
      case "email_taken":
        return "An account with that email already exists.";
      case "email_not_confirmed":
        return "Please confirm your email address, then sign in.";
      case "requires_recent_login":
        return "For your security, please sign in again before continuing.";
      case "network":
        return "No connection. Check your network and try again.";
      case "unknown":
        return "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}
