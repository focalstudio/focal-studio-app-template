/**
 * Firebase implementation of the AuthProvider port — Firebase JS SDK path.
 *
 * Installed by `bash scripts/add-backend.sh firebase`, which copies this file
 * to src/services/auth/firebase.ts — the relative imports below assume that
 * location. See docs/backends/firebase.md for setup and for the React Native
 * Firebase alternative.
 *
 * Why the JS SDK and not @react-native-firebase: this path needs no config
 * plugin, no native modules, and still runs in Expo Go. React Native Firebase
 * requires a dev client, plugin entries in app.json, and `forceStaticLinking`
 * on this template's SDK 56 / RN 0.85 — all of which invalidate the EAS build
 * cache. Take that trade only when you need Analytics, Crashlytics, or FCM;
 * the recipe documents the migration.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import * as firebaseAuth from "firebase/auth";
import {
  initializeAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
  signOut as fbSignOut,
  onIdTokenChanged,
} from "firebase/auth";
import type { User as FirebaseUser, Auth, Persistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireEnv, env } from "../../env";
import { AuthError } from "./types";
import type { AuthProvider, AuthSession } from "./types";

const app = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: requireEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
      authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: requireEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
      appId: requireEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
    });

/**
 * `getReactNativePersistence` exists in the React Native bundle but is missing
 * from the published web typings (firebase-js-sdk #9316, open since v10).
 * Reading it off the namespace avoids a `@ts-expect-error`, which would itself
 * become an error the day upstream fixes the types.
 */
const getReactNativePersistence = (
  firebaseAuth as unknown as {
    getReactNativePersistence: (storage: unknown) => Persistence;
  }
).getReactNativePersistence;

/**
 * `initializeAuth` with explicit persistence, NOT `getAuth`.
 *
 * Plain `getAuth(app)` in React Native falls back to in-memory persistence and
 * signs the user out on every cold start — silently, with no warning in the
 * console. It is the single most-reported Firebase + Expo bug.
 */
export const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

/** Exported so `social.ts` maps sessions identically. See add-social-auth.sh. */
export async function toAuthSession(user: FirebaseUser | null): Promise<AuthSession | null> {
  if (!user) return null;
  const token = await user.getIdTokenResult();
  return {
    accessToken: token.token,
    refreshToken: user.refreshToken || null,
    // Firebase reports expiry as an ISO string; the port uses epoch seconds.
    expiresAt: Math.floor(new Date(token.expirationTime).getTime() / 1000),
    user: {
      id: user.uid,
      email: user.email ?? "",
      name: user.displayName ?? undefined,
    },
  };
}

/**
 * Maps a Firebase error code onto the port's codes.
 *
 * Never surface Firebase's raw message — it embeds request IDs and internal
 * identifiers that mean nothing to a user.
 *
 * Exported for the same reason as `toAuthSession` above.
 */
export function toAuthError(err: unknown): AuthError {
  const code = (err as { code?: string })?.code ?? "";
  const message = err instanceof Error ? err.message : String(err);

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return new AuthError("invalid_credentials", message, err);
    case "auth/email-already-in-use":
      return new AuthError("email_taken", message, err);
    case "auth/requires-recent-login":
      return new AuthError("requires_recent_login", message, err);
    case "auth/network-request-failed":
      return new AuthError("network", message, err);
    default:
      return new AuthError("unknown", message, err);
  }
}

export const firebaseAuthProvider: AuthProvider = {
  name: "firebase",

  /**
   * Firebase restores the persisted user asynchronously, so `auth.currentUser`
   * is still null immediately after startup. Wait for the first auth-state
   * callback instead of reading it directly, or every cold start looks
   * signed-out for a frame and the route guards bounce the user to login.
   */
  getSession(): Promise<AuthSession | null> {
    return new Promise((resolve, reject) => {
      const unsubscribe = firebaseAuth.onAuthStateChanged(
        auth,
        async (user) => {
          unsubscribe();
          try {
            resolve(await toAuthSession(user));
          } catch (err) {
            reject(toAuthError(err));
          }
        },
        (err) => {
          unsubscribe();
          reject(toAuthError(err));
        }
      );
    });
  },

  async signIn(email, password): Promise<AuthSession> {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const session = await toAuthSession(cred.user);
      if (!session) throw new AuthError("unknown", "Sign-in returned no user.");
      return session;
    } catch (err) {
      throw err instanceof AuthError ? err : toAuthError(err);
    }
  },

  async signUp(email, password, name): Promise<AuthSession | null> {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
      return await toAuthSession(cred.user);
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async resetPassword(email): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async signOut(): Promise<void> {
    try {
      await fbSignOut(auth);
    } catch (err) {
      throw toAuthError(err);
    }
  },

  /**
   * Firebase deletes the auth user directly from the client, but refuses if the
   * session is older than roughly five minutes — `auth/requires-recent-login`.
   * That surfaces as `requires_recent_login`, which the UI turns into "please
   * sign in again", rather than a generic failure.
   *
   * Firestore/Storage data is NOT removed by this. Either add a Cloud Function
   * on user delete, or use the "Delete User Data" Firebase Extension. Whatever
   * you choose must actually run before you answer Play's Data safety form.
   */
  async deleteAccount(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new AuthError("unknown", "No signed-in user to delete.");
    try {
      // Throws on failure, leaving local state intact — that is the contract.
      await deleteUser(user);
    } catch (err) {
      throw toAuthError(err);
    }
  },

  /**
   * `onIdTokenChanged` rather than `onAuthStateChanged`: it fires on token
   * refresh as well as sign-in/out, so the stored session's accessToken and
   * expiresAt stay current instead of going stale after the first hour.
   */
  subscribe(onChange): () => void {
    return onIdTokenChanged(auth, async (user) => {
      try {
        onChange(await toAuthSession(user));
      } catch {
        onChange(null);
      }
    });
  },

  // Social sign-in is intentionally not implemented here. It needs native
  // modules and dashboard configuration that not every app wants, so it is
  // opt-in: `bash scripts/add-social-auth.sh` installs the packages and
  // composes the methods onto this provider in src/services/auth/index.ts.
  // Until then, omitting them makes the UI report "not configured" rather
  // than rendering a dead button.
};
