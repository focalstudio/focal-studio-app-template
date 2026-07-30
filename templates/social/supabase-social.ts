/**
 * Sign in with Apple, composed onto the Supabase AuthProvider.
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
 * never rewritten by a script, and so an app that doesn't want Apple sign-in
 * never pulls in a native module it has no use for.
 *
 * See docs/backends/supabase.md for the Apple Developer and Supabase dashboard
 * setup this cannot do for you.
 */

import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase, toAuthSession, toAuthError } from "./supabase";
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
 * `Required<Pick<...>>` rather than `Pick<...>`: both social members are
 * optional on AuthProvider, so a plain Pick would let this module implement
 * nothing at all and still typecheck. Widen the union when Google lands.
 */
export const socialAuth: Required<Pick<AuthProvider, "signInWithApple">> = {
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
};

/**
 * Persists the name Apple gives us, once.
 *
 * Apple returns `fullName` only on the *first ever* authorization for this
 * Apple ID and app pair. Every later sign-in returns nulls — reinstalling does
 * not reset it; the user has to revoke the app under Settings -> Apple ID ->
 * Sign in with Apple. If we don't write it now it is gone for good, and the
 * account is stuck showing an email address where its name should be.
 */
async function captureAppleName(
  session: AuthSession,
  credential: AppleAuthentication.AppleAuthenticationCredential
): Promise<AuthSession> {
  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(" ");

  if (!name || session.user.name) return session;

  try {
    await supabase.auth.updateUser({ data: { name } });
  } catch (err) {
    // A failed name write must not fail the sign-in — the user is already
    // authenticated at this point, and reporting an error here would be a lie.
    console.warn("[Auth] Could not save the name Apple provided:", err);
    return session;
  }

  return { ...session, user: { ...session.user, name } };
}
