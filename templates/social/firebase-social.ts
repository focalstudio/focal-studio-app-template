/**
 * Social sign-in (Apple + Google), composed onto the Firebase AuthProvider.
 *
 * Installed by `bash scripts/add-social-auth.sh`, which copies this file to
 * src/services/auth/social.ts — the relative imports below assume that
 * location — and then composes it in src/services/auth/index.ts:
 *
 *     export const authProvider: AuthProvider = {
 *       ...firebaseAuthProvider,
 *       ...socialAuth,
 *     };
 *
 * It lives beside the adapter rather than inside it so the ~215-line adapter is
 * never rewritten by a script, and so an app that doesn't want social sign-in
 * never pulls in native modules it has no use for.
 *
 * The two providers share almost nothing. Apple is a native sheet that returns
 * an identity token; Google is a browser round-trip with a redirect URI, PKCE,
 * and a token exchange. Read them as two recipes that happen to live in one
 * file, not as variations on one.
 *
 * See docs/backends/firebase.md for the Apple Developer, Google Cloud, and
 * Firebase Console setup this cannot do for you.
 */

import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSessionApi from "expo-auth-session";
import * as Crypto from "expo-crypto";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  updateProfile,
} from "firebase/auth";
import { auth, toAuthSession, toAuthError } from "./firebase";
import { appleNameToPersist } from "./appleName";
import { googleReversedClientId } from "./oauthCallback";
import { requireEnv } from "../../env";
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
 * The one difference from the Supabase recipe, and the one that costs people an
 * afternoon.
 *
 * Supabase's `signInWithIdToken` takes the identity token and nothing else.
 * Firebase's Apple credential requires a nonce, and the two sides get
 * *different values derived from the same secret*:
 *
 *   - Apple's sheet is given SHA-256(raw), and embeds it in the token's `nonce`
 *     claim.
 *   - Firebase is given the RAW nonce; it hashes that itself and compares.
 *
 * Hand either side the other's value and Firebase rejects the credential with
 * `auth/invalid-credential` — a message that points nowhere near the cause.
 *
 * `digestStringAsync` defaults to lowercase hex, which is the encoding Firebase
 * hashes to. Asking for `CryptoEncoding.BASE64` here fails the same opaque way.
 */
async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw
  );

  return { raw, hashed };
}

/**
 * Google's OAuth endpoints, written out rather than discovered.
 *
 * `AuthSession.useAutoDiscovery()` would fetch these, but it is a React hook and
 * cannot be called from a plain module. They are stable, and hard-coding them
 * also removes a network round-trip from the start of every sign-in.
 */
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

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

    const nonce = await generateNonce();

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: nonce.hashed,
      });
    } catch (err) {
      if ((err as { code?: string }).code === APPLE_CANCELED) throw cancelled();
      throw new AuthError("unknown", (err as Error).message, err);
    }

    if (!credential.identityToken) {
      throw new AuthError("unknown", "Apple returned no identity token.");
    }

    let session: AuthSession | null;
    try {
      const result = await signInWithCredential(
        auth,
        new OAuthProvider("apple.com").credential({
          idToken: credential.identityToken,
          rawNonce: nonce.raw,
        })
      );
      session = await toAuthSession(result.user);
    } catch (err) {
      throw toAuthError(err);
    }

    if (!session) throw new AuthError("unknown", "Apple sign-in returned no session.");

    return await captureAppleName(session, credential);
  },

  /**
   * Google, via `expo-auth-session` — not `signInWithPopup` / `signInWithRedirect`.
   *
   * Every Firebase web tutorial reaches for those two, and **neither works in
   * React Native**: both need a `window` to navigate. There is no shim for this.
   * The supported route is to run the OAuth flow yourself, then hand the
   * resulting ID token to `signInWithCredential`.
   *
   * It has to be the **authorization-code flow with PKCE**, not implicit —
   * Google refuses to issue an `id_token` directly to an installed app. And it
   * has to be the imperative `AuthRequest` API: `expo-auth-session/providers/google`
   * is a React hook, and this is a plain module the port calls as a function.
   *
   * iOS only, deliberately. See the guard below.
   */
  async signInWithGoogle(): Promise<AuthSession> {
    // Android needs its own OAuth client, keyed to the package name and the
    // signing certificate's SHA-1 — which differs between a local build, EAS,
    // and Play App Signing. Sending the iOS client ID from Android fails with an
    // opaque `redirect_uri_mismatch`, so refuse with something actionable
    // instead. docs/backends/firebase.md covers the upgrade path.
    if (Platform.OS !== "ios") {
      throw new AuthError(
        "not_wired",
        "Google sign-in is wired for iOS only on the Firebase JS SDK path. Android " +
          "needs its own OAuth client and SHA-1 fingerprint — see docs/backends/firebase.md."
      );
    }

    // Read inside the method, never at module scope: an app that wants Apple
    // sign-in and not Google would otherwise fail at import time, taking the
    // whole auth provider down with it.
    const clientId = requireEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID");

    // Google's iOS clients accept exactly this redirect shape — one slash, not
    // two. The same reversed string must be a CFBundleURLSchemes entry in
    // app.json, or the browser opens and never comes back.
    const redirectUri = `${googleReversedClientId(clientId)}:/oauthredirect`;

    const request = new AuthSessionApi.AuthRequest({
      clientId,
      redirectUri,
      scopes: ["openid", "profile", "email"],
      responseType: AuthSessionApi.ResponseType.Code,
      usePKCE: true,
    });

    const result = await request.promptAsync(GOOGLE_DISCOVERY);

    // expo-auth-session has already parsed the callback for us here, which is
    // why `parseOAuthCallback` is not used on this path — it exists for the
    // Supabase recipe, which gets a raw URL back from WebBrowser.
    if (result.type === "cancel" || result.type === "dismiss") throw cancelled();
    if (result.type !== "success") {
      throw new AuthError(
        "unknown",
        result.type === "error"
          ? (result.error?.message ?? "Google sign-in failed.")
          : `Google sign-in did not complete (${result.type}).`
      );
    }

    // Both halves of the exchange are checked here rather than passed through,
    // because Google answers a missing or empty one with the same generic
    // `invalid_grant` it uses for a genuinely wrong verifier — an error that
    // sends you looking at your PKCE implementation when the real problem is a
    // parameter that never arrived.
    //
    // `result.params` is typed as a plain string map, so `code` is only
    // *conventionally* present on a success; `codeVerifier` is populated by
    // AuthRequest whenever `usePKCE` is true, so an empty one means the request
    // was never prepared.
    const code = result.params.code;
    if (!code) {
      throw new AuthError(
        "unknown",
        "Google reported success but returned no authorization code."
      );
    }
    if (!request.codeVerifier) {
      throw new AuthError(
        "unknown",
        "The PKCE code verifier is missing, so the token exchange would be rejected. " +
          "The Google auth request was not prepared correctly."
      );
    }

    let session: AuthSession | null;
    try {
      const tokens = await AuthSessionApi.exchangeCodeAsync(
        {
          clientId,
          redirectUri,
          code,
          // The verifier half of PKCE. `AuthRequest` generated it and sent only
          // its hash to Google; the exchange proves we are the same client.
          extraParams: { code_verifier: request.codeVerifier },
        },
        GOOGLE_DISCOVERY
      );

      if (!tokens.idToken) {
        throw new AuthError("unknown", "Google returned no ID token.");
      }

      // Firebase verifies the ID token; the access token is passed along so the
      // credential can also be used against Google APIs if you add scopes later.
      const result_ = await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(tokens.idToken, tokens.accessToken)
      );
      session = await toAuthSession(result_.user);
    } catch (err) {
      // `auth/invalid-credential` here almost always means the Firebase project
      // has no iOS app registered, so the token's audience — your bundle ID — is
      // one Firebase doesn't recognise. docs/backends/firebase.md, section 5.
      throw err instanceof AuthError ? err : toAuthError(err);
    }

    if (!session) throw new AuthError("unknown", "Google sign-in returned no session.");
    return session;
  },
};

/**
 * Persists the name Apple gives us, once.
 *
 * The decision of *what* to write lives in `appleNameToPersist` — a pure
 * function with real test coverage, because Apple sends the name only on the
 * first authorization ever and a bug here cannot be recovered per user. All
 * that is left here is the write itself.
 *
 * Firebase does not populate `displayName` from an Apple credential on its own,
 * so this is the only thing standing between you and a permanently nameless
 * user record.
 */
async function captureAppleName(
  session: AuthSession,
  credential: AppleAuthentication.AppleAuthenticationCredential
): Promise<AuthSession> {
  const name = appleNameToPersist(credential.fullName, session.user.name);
  if (name === null) return session;

  const user = auth.currentUser;
  if (!user) return session;

  try {
    await updateProfile(user, { displayName: name });
  } catch (err) {
    // A failed name write must not fail the sign-in — the user is already
    // authenticated at this point, and reporting an error here would be a lie.
    console.warn("[Auth] Could not save the name Apple provided:", err);
    return session;
  }

  return { ...session, user: { ...session.user, name } };
}
