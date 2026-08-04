/**
 * Social sign-in (Apple + Google), composed onto the Supabase AuthProvider.
 *
 * Installed by `bash scripts/add-social-auth.sh`, which copies this file to
 * src/services/auth/social.ts — the relative imports below assume that
 * location — and then composes it in src/services/auth/index.ts:
 *
 *     export const authProvider: AuthProvider = {
 *       ...supabaseAuthProvider,
 *       ...socialAuth,
 *     };
 *
 * It lives beside the adapter rather than inside it so the ~190-line adapter is
 * never rewritten by a script, and so an app that doesn't want social sign-in
 * never pulls in native modules it has no use for.
 *
 * The two providers share almost nothing. Apple is a native sheet that returns
 * an identity token; Google is a browser round-trip with a redirect URI, PKCE,
 * and a callback to parse. Read them as two recipes that happen to live in one
 * file, not as variations on one.
 *
 * Neither Google's client ID nor its secret enters the app on this backend —
 * both live in the Supabase dashboard, and Supabase performs the token
 * exchange. See docs/backends/supabase.md for the dashboard setup this cannot
 * do for you.
 */

import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase, toAuthSession, toAuthError } from "./supabase";
import { appleNameToPersist } from "./appleName";
import { parseOAuthCallback } from "./oauthCallback";
import { AuthError } from "./types";
import type { AuthProvider, AuthSession } from "./types";

/**
 * Apple's own cancel code. Dismissing the sheet is a deliberate user action,
 * not a failure — the store swallows `cancelled` so nothing is shown.
 */
const APPLE_CANCELED = "ERR_REQUEST_CANCELED";

function cancelled(): AuthError {
  return new AuthError("cancelled", "Sign-in was cancelled.");
}

/**
 * Sign in with Apple is iOS-only here, and needs the native module.
 *
 * `isAvailableAsync()` throws rather than returning false in Expo Go, where the
 * module isn't present at all — so this must catch, not just check.
 */
async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * The path the browser is sent back to, and the one Supabase is told to
 * redirect to. It must be **the same string in both places, byte for byte**, or
 * `openAuthSessionAsync` never recognises the return and the browser sits there
 * until the user gives up.
 *
 * `Linking.createURL` resolves it per build: `exp://…/--/auth/callback` in Expo
 * Go, `<scheme>://auth/callback` in a dev client or standalone. Every form your
 * team runs has to be in Supabase's Redirect URLs allowlist — this is why OAuth
 * "works in Expo Go and breaks in TestFlight".
 */
function googleRedirectTo(): string {
  return Linking.createURL("auth/callback");
}

/**
 * `Required<Pick<...>>` rather than `Pick<...>`: both social members are
 * optional on AuthProvider, so a plain Pick would let this module implement
 * nothing at all and still typecheck.
 */
export const socialAuth: Required<
  Pick<AuthProvider, "signInWithApple" | "signInWithGoogle">
> = {
  async signInWithApple(): Promise<AuthSession> {
    if (!(await appleAvailable())) {
      throw new AuthError(
        "not_wired",
        "Sign in with Apple isn't available on this device. It needs a development or production build — not Expo Go."
      );
    }

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (err) {
      if ((err as { code?: string }).code === APPLE_CANCELED) throw cancelled();
      throw new AuthError("unknown", (err as Error).message, err);
    }

    if (!credential.identityToken) {
      throw new AuthError("unknown", "Apple returned no identity token.");
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) throw toAuthError(error);

    const session = toAuthSession(data.session);
    if (!session) throw new AuthError("unknown", "Apple sign-in returned no session.");

    return await captureAppleName(session, credential);
  },

  /**
   * Google, via a browser round-trip. No native module and no client secret in
   * the app — Supabase holds both halves of the Google credential and does the
   * token exchange.
   *
   * Works on iOS and Android alike, which Apple's native-sheet recipe does not.
   */
  async signInWithGoogle(): Promise<AuthSession> {
    const redirectTo = googleRedirectTo();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Mandatory on Expo, and the failure is baffling without it: supabase-js
        // otherwise tries to navigate `window.location`, which does not exist
        // here, so you get no navigation *and* no `data.url` to hand to
        // WebBrowser. The call appears to succeed and nothing happens.
        skipBrowserRedirect: true,
      },
    });
    if (error) throw toAuthError(error);
    if (!data?.url) {
      throw new AuthError("unknown", "Supabase returned no authorization URL for Google.");
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    // "cancel" is the user dismissing the sheet, "dismiss" is iOS closing it.
    // Neither is a failure, and the store swallows `cancelled` so nothing is
    // shown for a tap the user took back.
    if (result.type !== "success") throw cancelled();

    const callback = parseOAuthCallback(result.url);

    switch (callback.kind) {
      // The PKCE shape, which `flowType: "pkce"` in supabase.ts produces.
      case "code": {
        const exchanged = await supabase.auth.exchangeCodeForSession(callback.code);
        if (exchanged.error) throw toAuthError(exchanged.error);
        return requireSession(toAuthSession(exchanged.data.session));
      }

      // The implicit shape. Only reachable on an app whose adapter predates
      // `flowType: "pkce"` — handled so that upgrading the template does not
      // require editing an adapter the install script promises not to touch.
      case "tokens": {
        if (!callback.refreshToken) {
          throw new AuthError(
            "unknown",
            "Google sign-in returned an access token with no refresh token, so the " +
              'session could not be stored. Set `flowType: "pkce"` in your Supabase ' +
              "client — see docs/backends/supabase.md."
          );
        }
        const restored = await supabase.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });
        if (restored.error) throw toAuthError(restored.error);
        return requireSession(toAuthSession(restored.data.session));
      }

      case "error":
        throw new AuthError(callback.code, callback.message);
    }
  },
};

/** Both Google branches end the same way, and a null here is never expected. */
function requireSession(session: AuthSession | null): AuthSession {
  if (!session) throw new AuthError("unknown", "Google sign-in returned no session.");
  return session;
}

/**
 * Persists the name Apple gives us, once.
 *
 * The decision of *what* to write lives in `appleNameToPersist` — a pure
 * function with real test coverage, because Apple sends the name only on the
 * first authorization ever and a bug here cannot be recovered per user. All
 * that is left here is the write itself.
 */
async function captureAppleName(
  session: AuthSession,
  credential: AppleAuthentication.AppleAuthenticationCredential
): Promise<AuthSession> {
  const name = appleNameToPersist(credential.fullName, session.user.name);
  if (name === null) return session;

  // A failed name write must not fail the sign-in — the user is already
  // authenticated at this point, and reporting an error here would be a lie.
  // It must not be reported as a *success* either: returning the session with
  // the name attached shows the user a name the server never stored, and the
  // next getSession() silently drops it.
  //
  // Both failure shapes are handled, because supabase-js has two. API errors
  // come back as a *returned* `{ error }` — which a try/catch alone never sees,
  // and which is the shape a rejected write actually takes — while a transport
  // failure still rejects.
  try {
    const { error } = await supabase.auth.updateUser({ data: { name } });
    if (error) {
      console.warn("[Auth] Could not save the name Apple provided:", error);
      return session;
    }
  } catch (err) {
    console.warn("[Auth] Could not save the name Apple provided:", err);
    return session;
  }

  return { ...session, user: { ...session.user, name } };
}
