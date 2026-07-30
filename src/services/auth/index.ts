import { localAuthProvider } from "./local";
import type { AuthProvider } from "./types";

export { AuthError, isSessionExpired, isValidSession, isValidUser } from "./types";
export { authErrorMessage } from "./messages";
export type { AuthProvider, AuthSession, AuthErrorCode } from "./types";

/**
 * The active auth backend.
 *
 * `scripts/add-backend.sh` rewrites this one assignment — nothing else in the
 * app imports a provider directly, so swapping Supabase for Firebase (or back)
 * is a single-line change plus one adapter file.
 */
export const authProvider: AuthProvider = localAuthProvider;
