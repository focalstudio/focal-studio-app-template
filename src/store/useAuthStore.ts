import { create } from "zustand";
import type { User } from "../types";
import { authProvider, AuthError } from "../services/auth";
import type { AuthSession } from "../services/auth";
import { clearQueryCache } from "../lib/queryClient";

type AuthState = {
  session: AuthSession | null;
  user: User | null;
  isAuthenticated: boolean;
  /** Boot-time hydration flag. Gates the splash screen — NOT per-action loading. */
  isLoading: boolean;
  /** True while a user-initiated auth action is in flight. Drives button spinners. */
  isSubmitting: boolean;

  hydrate: () => Promise<void>;
  init: () => () => void;

  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves false when the provider requires email confirmation first. */
  signUp: (email: string, password: string, name?: string) => Promise<boolean>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const signedOut = { session: null, user: null, isAuthenticated: false } as const;

function applySession(session: AuthSession | null) {
  return session === null
    ? signedOut
    : { session, user: session.user, isAuthenticated: true };
}

/**
 * Dismissing the Apple sheet or the OAuth browser is a deliberate user action,
 * not a failure. Swallowing it here rather than in each screen means no caller
 * has to special-case it, and nobody sees a red error for a tap they took back.
 */
function isCancellation(err: unknown): boolean {
  return err instanceof AuthError && err.code === "cancelled";
}

export const useAuthStore = create<AuthState>((set) => ({
  ...signedOut,
  isLoading: true,
  isSubmitting: false,

  /**
   * Restores a persisted session once at boot. `app/_layout.tsx` holds the
   * splash screen until this settles.
   */
  hydrate: async () => {
    try {
      const session = await authProvider.getSession();
      set({ ...applySession(session), isLoading: false });
    } catch {
      // A provider that cannot reach the network must not trap the user on the
      // splash screen. Fall back to signed-out; the listener will correct us.
      set({ ...signedOut, isLoading: false });
    }
  },

  /**
   * Opens the provider's session subscription and returns its unsubscribe.
   * Call from a `useEffect` in `app/_layout.tsx` and return this as cleanup —
   * see the "Cleanup contracts" section of the `expo-services` skill.
   *
   * This catches changes the store never initiated: a background token
   * refresh, an expiry, or a sign-out performed on another device.
   */
  init: () => authProvider.subscribe((session) => set(applySession(session))),

  signIn: async (email, password) => {
    set({ isSubmitting: true });
    try {
      const session = await authProvider.signIn(email, password);
      set(applySession(session));
    } finally {
      set({ isSubmitting: false });
    }
  },

  signUp: async (email, password, name) => {
    set({ isSubmitting: true });
    try {
      const session = await authProvider.signUp(email, password, name);
      if (session === null) return false; // confirmation email sent
      set(applySession(session));
      return true;
    } finally {
      set({ isSubmitting: false });
    }
  },

  signInWithApple: async () => {
    if (!authProvider.signInWithApple) {
      throw new AuthError("not_wired", "Apple sign-in is not configured for this app.");
    }
    set({ isSubmitting: true });
    try {
      set(applySession(await authProvider.signInWithApple()));
    } catch (err) {
      if (!isCancellation(err)) throw err;
    } finally {
      set({ isSubmitting: false });
    }
  },

  signInWithGoogle: async () => {
    if (!authProvider.signInWithGoogle) {
      throw new AuthError("not_wired", "Google sign-in is not configured for this app.");
    }
    set({ isSubmitting: true });
    try {
      set(applySession(await authProvider.signInWithGoogle()));
    } catch (err) {
      if (!isCancellation(err)) throw err;
    } finally {
      set({ isSubmitting: false });
    }
  },

  resetPassword: async (email) => {
    set({ isSubmitting: true });
    try {
      await authProvider.resetPassword(email);
    } finally {
      set({ isSubmitting: false });
    }
  },

  /**
   * Clears local state even if the provider's remote sign-out fails. A failed
   * sign-out must never strand the user in a signed-in UI — the opposite of
   * the deleteAccount contract below, and deliberately so.
   */
  signOut: async () => {
    set({ isSubmitting: true });
    try {
      await authProvider.signOut();
    } catch {
      // Intentionally swallowed; local state is cleared regardless.
    } finally {
      // Must happen on every path, including the failed one. Cached data
      // belonging to the outgoing user would otherwise be served to whoever
      // signs in next on this device.
      clearQueryCache();
      set({ ...signedOut, isSubmitting: false });
    }
  },

  /**
   * Permanently deletes the account.
   *
   * Contract: if the remote delete fails, this THROWS and local state is left
   * untouched, so the UI can surface the error and keep the user signed in.
   * Signing someone out while their account still exists looks identical to a
   * successful deletion — exactly the failure Google Play's "Data safety"
   * account-deletion requirement exists to prevent.
   *
   * `app/(tabs)/settings.tsx` already depends on this: it catches, alerts
   * "Couldn't Delete Account", and does not navigate away.
   *
   * Implementers: also purge app data cached under STORAGE_PREFIX and cancel
   * scheduled notifications. Deleting the account server-side does not clear
   * the device, and an orphaned reminder will fire for a deleted account.
   */
  deleteAccount: async () => {
    set({ isSubmitting: true });
    try {
      // Throws on failure, so nothing below runs — that is the point. The
      // cache must NOT be cleared on the failure path: the user is still
      // signed in and still looking at their data.
      await authProvider.deleteAccount();
      clearQueryCache();
      set(signedOut);
    } finally {
      set({ isSubmitting: false });
    }
  },
}));
