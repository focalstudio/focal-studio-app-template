import AsyncStorage from "@react-native-async-storage/async-storage";
import { localAuthProvider } from "../local";
import { STORAGE_PREFIX } from "../../../constants";
import type { AuthSession } from "../types";

/**
 * Tests the no-backend scaffold directly.
 *
 * These used to live in `useAuthStore.test.ts` and reached the scaffold through
 * the store's `authProvider` singleton. That only held while the template had
 * no backend: once `scripts/add-backend.sh` swaps the barrel's export, the
 * store no longer talks to this provider and every assertion here became false
 * — the suite went red in any app that wired Supabase.
 *
 * Importing `../local` rather than the barrel also keeps this suite free of the
 * adapter's native imports (`expo-sqlite`), which cannot load under Jest.
 */

const SESSION_KEY = `${STORAGE_PREFIX}auth_session`;
const LEGACY_USER_KEY = `${STORAGE_PREFIX}auth_user`;

const session: AuthSession = {
  accessToken: "token",
  refreshToken: "refresh",
  expiresAt: null,
  user: { id: "1", email: "a@b.c", name: "Ada" },
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("localAuthProvider — session persistence", () => {
  it("returns null when nothing is stored", async () => {
    await expect(localAuthProvider.getSession()).resolves.toBeNull();
  });

  it("restores a valid persisted session", async () => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await expect(localAuthProvider.getSession()).resolves.toEqual(session);
  });

  it("migrates a legacy bare-user blob and drops the old key", async () => {
    const legacyUser = { id: "9", email: "legacy@b.c" };
    await AsyncStorage.setItem(LEGACY_USER_KEY, JSON.stringify(legacyUser));

    const restored = await localAuthProvider.getSession();

    expect(restored?.user).toEqual(legacyUser);
    expect(await AsyncStorage.getItem(LEGACY_USER_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  // Persisted blobs are untrusted input: a partial write or an older app
  // version can leave a shape that would otherwise be handed to the UI as a
  // signed-in user.
  const malformed: [string, unknown][] = [
    ["empty object", {}],
    [
      "non-string accessToken",
      { accessToken: 1, refreshToken: null, expiresAt: null, user: { id: "x", email: "a@b" } },
    ],
    ["missing user", { accessToken: "t", refreshToken: null, expiresAt: null }],
    [
      "user with non-string id",
      { accessToken: "t", refreshToken: null, expiresAt: null, user: { id: 1, email: "a@b" } },
    ],
    [
      "user missing email",
      { accessToken: "t", refreshToken: null, expiresAt: null, user: { id: "x" } },
    ],
    [
      "expiresAt as a string",
      { accessToken: "t", refreshToken: null, expiresAt: "soon", user: { id: "x", email: "a@b" } },
    ],
    ["a raw string", "a string"],
    ["null", null],
  ];

  it.each(malformed)("rejects a malformed persisted session (%s)", async (_desc, raw) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(raw));
    await expect(localAuthProvider.getSession()).resolves.toBeNull();
  });
});

describe("localAuthProvider — refuses remote calls", () => {
  // The previous scaffold let signup mint { id: "placeholder" } and granted
  // full app access, shipping silently in any app that hadn't wired auth.
  it.each([
    ["signIn", () => localAuthProvider.signIn("a@b.c", "password")],
    ["signUp", () => localAuthProvider.signUp("a@b.c", "password", "Ada")],
    ["resetPassword", () => localAuthProvider.resetPassword("a@b.c")],
  ])("%s throws not_wired instead of succeeding", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: "not_wired" });
  });

  it("says how to wire a backend", async () => {
    await expect(localAuthProvider.signIn("a@b.c", "pw")).rejects.toThrow(
      /add-backend\.sh/
    );
  });

  // Omitted rather than throwing: the UI checks for their presence to decide
  // between "not configured" and a working button.
  it.each(["signInWithApple", "signInWithGoogle"] as const)(
    "omits %s entirely",
    (method) => {
      expect(localAuthProvider[method]).toBeUndefined();
    }
  );
});

describe("localAuthProvider — clearing state", () => {
  it.each(["signOut", "deleteAccount"] as const)("%s removes both storage keys", async (method) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await AsyncStorage.setItem(LEGACY_USER_KEY, JSON.stringify(session.user));

    await localAuthProvider[method]();

    expect(await AsyncStorage.getItem(SESSION_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_USER_KEY)).toBeNull();
  });

  it("subscribe returns a callable unsubscribe", () => {
    const unsubscribe = localAuthProvider.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });
});
