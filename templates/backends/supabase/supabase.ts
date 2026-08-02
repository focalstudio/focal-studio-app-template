/**
 * Supabase implementation of the AuthProvider port.
 *
 * Installed by `bash scripts/add-backend.sh supabase`, which copies this file
 * to src/services/auth/supabase.ts — the relative imports below assume that
 * location. See docs/backends/supabase.md for the full setup.
 *
 * Almost every line that looks removable here exists because omitting it
 * silently signs users out on cold start. Read the comments before trimming.
 */

// React Native still has no native URL/URLSearchParams. Without this,
// supabase-js throws `URL.hostname is not implemented, js engine: hermes`.
import "react-native-url-polyfill/auto";

// Installs a `localStorage` shim backed by expo-sqlite. This is the session
// store Supabase and Expo now recommend for React Native. It is deliberately
// NOT expo-secure-store: SecureStore caps values at 2048 bytes and a Supabase
// session already exceeds that, so writes fail — silently today, with a hard
// error in a future SDK.
import "expo-sqlite/localStorage/install";

import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import type { Session, AuthError as SupabaseAuthError } from "@supabase/supabase-js";
import { requireEnv } from "../../env";
import { AuthError } from "./types";
import type { AuthProvider, AuthSession } from "./types";

export const supabase = createClient(
  requireEnv("EXPO_PUBLIC_SUPABASE_URL"),
  requireEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  {
    auth: {
      // Without an explicit adapter, supabase-js defaults to browser
      // localStorage, which does not exist in React Native. This is the single
      // most common cause of "why am I logged out on every launch".
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Mandatory on native. There is no URL to parse a session out of, and
      // leaving it true causes spurious session churn.
      detectSessionInUrl: false,
      // Required for the OAuth flow in `social.ts`. supabase-js defaults to
      // `implicit`, which stores no code verifier — so the browser comes back
      // with `?code=` and `exchangeCodeForSession()` fails with "code verifier
      // should be non-empty". PKCE is also the only one of the two that is safe
      // on a device: the implicit flow puts the access token in a URL, where the
      // OS and any handler in the redirect chain can see it.
      //
      // Sign in with Apple is unaffected either way — it uses a native sheet and
      // an identity token, with no browser round-trip. Changing this does not
      // invalidate existing sessions, and `social.ts` reads both callback
      // shapes, so an app whose adapter predates this line keeps working.
      flowType: "pkce",
    },
  }
);

/**
 * Drives token refresh with app lifecycle.
 *
 * Registered once, at module scope, deliberately: putting this in a component
 * stacks a new listener on every mount. Without it, tokens expire while the app
 * is backgrounded and the first request after foregrounding 401s.
 */
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

/** Exported so `social.ts` maps sessions identically. See add-social-auth.sh. */
export function toAuthSession(session: Session | null): AuthSession | null {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? null,
    expiresAt: session.expires_at ?? null,
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
      name:
        (session.user.user_metadata?.name as string | undefined) ??
        (session.user.user_metadata?.full_name as string | undefined),
    },
  };
}

/**
 * Maps a Supabase error onto the port's error codes.
 *
 * Never surface `error.message` directly — Supabase returns internal Postgres
 * and GoTrue text that leaks schema detail and reads as gibberish to a user.
 *
 * Exported so `social.ts` reuses this table rather than growing a second copy
 * that drifts the first time a case is added here.
 */
export function toAuthError(error: SupabaseAuthError | Error): AuthError {
  const code = (error as SupabaseAuthError).code;
  const status = (error as SupabaseAuthError).status;

  switch (code) {
    case "invalid_credentials":
    case "invalid_grant":
      return new AuthError("invalid_credentials", error.message, error);
    case "email_not_confirmed":
      return new AuthError("email_not_confirmed", error.message, error);
    case "user_already_exists":
    case "email_exists":
      return new AuthError("email_taken", error.message, error);
    case "reauthentication_needed":
      return new AuthError("requires_recent_login", error.message, error);
  }

  // supabase-js surfaces offline/DNS failures as AuthRetryableFetchError with
  // no status. Treat as network so the UI says "check your connection" rather
  // than "invalid password".
  if (error.name === "AuthRetryableFetchError" || status === undefined) {
    return new AuthError("network", error.message, error);
  }
  if (status === 400 || status === 401) {
    return new AuthError("invalid_credentials", error.message, error);
  }
  return new AuthError("unknown", error.message, error);
}

export const supabaseAuthProvider: AuthProvider = {
  name: "supabase",

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw toAuthError(error);
    return toAuthSession(data.session);
  },

  async signIn(email, password): Promise<AuthSession> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAuthError(error);
    const session = toAuthSession(data.session);
    if (!session) throw new AuthError("unknown", "Sign-in returned no session.");
    return session;
  },

  async signUp(email, password, name): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: name ? { data: { name } } : undefined,
    });
    if (error) throw toAuthError(error);
    // With "Confirm email" enabled (the default), Supabase returns a user but
    // no session. That is success-pending-confirmation, not a failure — the
    // port's contract is to return null and let the UI say so.
    return toAuthSession(data.session);
  },

  async resetPassword(email): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw toAuthError(error);
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw toAuthError(error);
  },

  /**
   * The client SDK cannot call `auth.admin.deleteUser` — that needs the
   * service_role key, which must never ship in an app. Instead this calls a
   * SECURITY DEFINER function that deletes the caller's own row, letting
   * ON DELETE CASCADE clean up app data. See schema.sql.
   */
  async deleteAccount(): Promise<void> {
    const { error } = await supabase.rpc("delete_own_account");
    // Throw before touching local state. Signing someone out while their
    // account still exists is indistinguishable from a successful deletion.
    if (error) {
      throw new AuthError("unknown", error.message, error);
    }

    // Scope matters. A plain signOut() here fails with "User from sub claim in
    // JWT does not exist" — the user is already gone server-side — and that
    // error would surface as a failed deletion. Local-only clears the stored
    // session without calling the server.
    await supabase.auth.signOut({ scope: "local" });
  },

  subscribe(onChange): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      onChange(toAuthSession(session));
    });
    return () => data.subscription.unsubscribe();
  },

  // Social sign-in is intentionally not implemented here. It needs native
  // modules and dashboard configuration that not every app wants, so it is
  // opt-in: `bash scripts/add-social-auth.sh` installs the packages and
  // composes the methods onto this provider in src/services/auth/index.ts.
  // Until then, omitting them makes the UI report "not configured" rather
  // than rendering a dead button.
};
