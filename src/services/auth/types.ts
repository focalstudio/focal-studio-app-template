import type { User } from "../../types";

/**
 * A restored or freshly-issued auth session.
 *
 * This is deliberately provider-neutral: Supabase, Firebase, and a custom API
 * all expose these four facts in some shape, and nothing above this layer
 * should have to know which one is in use.
 */
export type AuthSession = {
  accessToken: string;
  /** Null when the provider issues no refresh token (e.g. the local scaffold). */
  refreshToken: string | null;
  /** Epoch **seconds**, matching JWT `exp`. Null means "never expires". */
  expiresAt: number | null;
  user: User;
};

export type AuthErrorCode =
  /** No backend is wired yet — the local scaffold throws this for every remote call. */
  | "not_wired"
  | "invalid_credentials"
  | "email_taken"
  | "email_not_confirmed"
  /** Provider needs a fresh login before it will delete the account. */
  | "requires_recent_login"
  /** User backed out of a native sheet or OAuth browser. Not a failure. */
  | "cancelled"
  | "network"
  | "unknown";

/**
 * The single error type every provider must throw, so screens can branch on
 * `code` instead of string-matching provider-specific messages.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly cause?: unknown;

  constructor(code: AuthErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.cause = cause;
  }
}

/**
 * The port every auth backend implements. Swapping providers means writing one
 * of these — `useAuthStore` and every `(auth)` screen stay untouched.
 *
 * Rules for implementers:
 * - Throw `AuthError` (never a raw provider error) from every method.
 * - `deleteAccount()` MUST throw if the remote delete fails. Do not clear local
 *   state on failure. Signing a user out while their account still exists looks
 *   identical to a successful deletion, and is exactly what Google Play's
 *   "Data safety" account-deletion requirement exists to prevent.
 * - `subscribe()` must return its own unsubscribe function.
 * - Throw `AuthError("cancelled")` when the user dismisses a native sheet or an
 *   OAuth browser. The store swallows it, so nothing is shown for a tap the
 *   user deliberately took back.
 * - Methods must not depend on `this`. Social sign-in is composed onto the
 *   active provider by object spread, which would not carry a bound receiver.
 */
export type AuthProvider = {
  /** Identifies the active backend in logs and dev tooling. */
  readonly name: string;

  /** Restore a persisted session at boot. Returns null when signed out. */
  getSession(): Promise<AuthSession | null>;

  signIn(email: string, password: string): Promise<AuthSession>;

  /**
   * Returns null when the provider requires email confirmation before a
   * session exists — the caller should tell the user to check their inbox
   * rather than treating it as a failure.
   */
  signUp(email: string, password: string, name?: string): Promise<AuthSession | null>;

  signOut(): Promise<void>;

  resetPassword(email: string): Promise<void>;

  deleteAccount(): Promise<void>;

  /**
   * Observe out-of-band session changes: token refresh, expiry, or a sign-out
   * triggered on another device. Returns its unsubscribe.
   */
  subscribe(onChange: (session: AuthSession | null) => void): () => void;

  /**
   * Optional social sign-in. A provider that omits these signals "not
   * configured", and the UI surfaces that rather than doing nothing.
   *
   * These are not implemented by the adapters themselves — run
   * `bash scripts/add-social-auth.sh` after wiring a backend and they are
   * composed on. See docs/backends/<provider>.md.
   */
  signInWithApple?(): Promise<AuthSession>;
  signInWithGoogle?(): Promise<AuthSession>;
};

/** True when the session is absent or its access token has expired. */
export function isSessionExpired(session: AuthSession | null): boolean {
  if (session === null) return true;
  if (session.expiresAt === null) return false;
  return session.expiresAt * 1000 <= Date.now();
}

/**
 * Validates a session read back from storage. Persisted blobs are untrusted
 * input — a partial write or an older app version can leave a malformed shape.
 */
export function isValidSession(value: unknown): value is AuthSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<AuthSession>;
  if (typeof s.accessToken !== "string") return false;
  if (s.refreshToken !== null && typeof s.refreshToken !== "string") return false;
  if (s.expiresAt !== null && typeof s.expiresAt !== "number") return false;
  return isValidUser(s.user);
}

export function isValidUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const u = value as Partial<User>;
  return typeof u.id === "string" && typeof u.email === "string";
}
