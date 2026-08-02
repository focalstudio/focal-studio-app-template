/**
 * Sign in with Apple, composed onto the Firebase AuthProvider.
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
 * never rewritten by a script, and so an app that doesn't want Apple sign-in
 * never pulls in a native module it has no use for.
 *
 * See docs/backends/firebase.md for the Apple Developer and Firebase Console
 * setup this cannot do for you.
 */

import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { OAuthProvider, signInWithCredential, updateProfile } from "firebase/auth";
import { auth, toAuthSession, toAuthError } from "./firebase";
import { appleNameToPersist } from "./appleName";
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
