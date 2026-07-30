import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../useAuthStore";
import { STORAGE_PREFIX } from "../../constants";
import { AuthError, authProvider } from "../../services/auth";
import type { AuthSession } from "../../services/auth";
import { queryClient } from "../../lib/queryClient";

const SESSION_KEY = `${STORAGE_PREFIX}auth_session`;
const LEGACY_USER_KEY = `${STORAGE_PREFIX}auth_user`;

const session: AuthSession = {
  accessToken: "token",
  refreshToken: "refresh",
  expiresAt: null,
  user: { id: "1", email: "a@b.c", name: "Ada" },
};

const initialState = useAuthStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useAuthStore.setState(initialState, true);
  jest.restoreAllMocks();
});

describe("useAuthStore — hydration", () => {
  it("hydrate with no stored session results in signed-out state and clears isLoading", async () => {
    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it("hydrate restores a valid persisted session", async () => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.session).toEqual(session);
    expect(state.user).toEqual(session.user);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("hydrate migrates a legacy bare-user blob and drops the old key", async () => {
    const legacyUser = { id: "9", email: "legacy@b.c" };
    await AsyncStorage.setItem(LEGACY_USER_KEY, JSON.stringify(legacyUser));

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().user).toEqual(legacyUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(await AsyncStorage.getItem(LEGACY_USER_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  // A provider that throws at boot (offline, corrupt keychain) must not trap
  // the user behind the splash screen, which waits on isLoading.
  it("hydrate clears isLoading even when the provider throws", async () => {
    jest.spyOn(authProvider, "getSession").mockRejectedValueOnce(new Error("offline"));
    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  const malformed: [string, unknown][] = [
    ["empty object", {}],
    ["non-string accessToken", { accessToken: 1, refreshToken: null, expiresAt: null, user: { id: "x", email: "a@b" } }],
    ["missing user", { accessToken: "t", refreshToken: null, expiresAt: null }],
    ["user with non-string id", { accessToken: "t", refreshToken: null, expiresAt: null, user: { id: 1, email: "a@b" } }],
    ["user missing email", { accessToken: "t", refreshToken: null, expiresAt: null, user: { id: "x" } }],
    ["expiresAt as a string", { accessToken: "t", refreshToken: null, expiresAt: "soon", user: { id: "x", email: "a@b" } }],
    ["a raw string", "a string"],
    ["null", null],
  ];

  it.each(malformed)(
    "hydrate rejects a malformed persisted session (%s) and still clears isLoading",
    async (_desc, raw) => {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(raw));
      await useAuthStore.getState().hydrate();
      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    }
  );
});

describe("useAuthStore — the local scaffold refuses remote calls", () => {
  // The previous scaffold let signup mint { id: "placeholder" } and granted
  // full app access, shipping silently in any app that hadn't wired auth.
  it("signUp throws not_wired instead of granting access", async () => {
    await expect(
      useAuthStore.getState().signUp("a@b.c", "password", "Ada")
    ).rejects.toMatchObject({ code: "not_wired" });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("signIn throws not_wired", async () => {
    await expect(
      useAuthStore.getState().signIn("a@b.c", "password")
    ).rejects.toMatchObject({ code: "not_wired" });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("resetPassword throws not_wired", async () => {
    await expect(
      useAuthStore.getState().resetPassword("a@b.c")
    ).rejects.toMatchObject({ code: "not_wired" });
  });

  // The local provider omits the optional social methods entirely, so the
  // buttons report "not configured" rather than silently doing nothing.
  it.each(["signInWithApple", "signInWithGoogle"] as const)(
    "%s throws not_wired when the provider omits it",
    async (method) => {
      await expect(useAuthStore.getState()[method]()).rejects.toMatchObject({
        code: "not_wired",
      });
    }
  );

  it("resets isSubmitting after a failed action", async () => {
    await expect(useAuthStore.getState().signIn("a@b.c", "pw")).rejects.toThrow();
    expect(useAuthStore.getState().isSubmitting).toBe(false);
  });
});

describe("useAuthStore — social sign-in", () => {
  type SocialMethod = "signInWithApple" | "signInWithGoogle";
  const methods: SocialMethod[] = ["signInWithApple", "signInWithGoogle"];

  /**
   * The local provider *omits* these methods, so jest.spyOn has nothing to
   * attach to — it throws. `scripts/add-social-auth.sh` composes them on at
   * install time, so simulating that means assigning the property outright.
   * Always restore, or the "throws not_wired when omitted" tests above start
   * failing depending on execution order.
   */
  function withSocialMethod(method: SocialMethod, impl: () => Promise<AuthSession>) {
    const target = authProvider as Record<string, unknown>;
    target[method] = impl;
    return () => {
      delete target[method];
    };
  }

  // Dismissing the Apple sheet is a deliberate user action. The action must
  // resolve, not reject: a rejection would surface a red error for a tap the
  // user took back on purpose.
  it.each(methods)("%s resolves silently when the user cancels", async (method) => {
    const restore = withSocialMethod(method, () => {
      throw new AuthError("cancelled", "Sign-in was cancelled.");
    });
    try {
      await expect(useAuthStore.getState()[method]()).resolves.toBeUndefined();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.session).toBeNull();
      expect(state.isSubmitting).toBe(false);
    } finally {
      restore();
    }
  });

  it.each(methods)("%s still rejects on a real failure", async (method) => {
    const restore = withSocialMethod(method, () =>
      Promise.reject(new AuthError("network", "offline"))
    );
    try {
      await expect(useAuthStore.getState()[method]()).rejects.toMatchObject({
        code: "network",
      });
      expect(useAuthStore.getState().isSubmitting).toBe(false);
    } finally {
      restore();
    }
  });

  it.each(methods)("%s adopts the session on success", async (method) => {
    const restore = withSocialMethod(method, () => Promise.resolve(session));
    try {
      await useAuthStore.getState()[method]();

      const state = useAuthStore.getState();
      expect(state.session).toEqual(session);
      expect(state.user).toEqual(session.user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isSubmitting).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("useAuthStore — signOut", () => {
  it("clears session, user, and persisted storage", async () => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    await useAuthStore.getState().signOut();

    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(await AsyncStorage.getItem(SESSION_KEY)).toBeNull();
  });

  // Opposite of deleteAccount: a failed remote sign-out must never strand the
  // user in a signed-in UI they can't leave.
  it("clears local state even when the provider's signOut throws", async () => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await useAuthStore.getState().hydrate();
    jest.spyOn(authProvider, "signOut").mockRejectedValueOnce(new Error("network"));

    await expect(useAuthStore.getState().signOut()).resolves.toBeUndefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isSubmitting).toBe(false);
  });
});

describe("useAuthStore — deleteAccount contract", () => {
  it("clears session and storage on success", async () => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await useAuthStore.getState().hydrate();

    await useAuthStore.getState().deleteAccount();

    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(await AsyncStorage.getItem(SESSION_KEY)).toBeNull();
  });

  /**
   * The load-bearing case for Google Play's "Data safety" account-deletion
   * requirement. Signing a user out while their account still exists is
   * indistinguishable from a successful deletion, so a failed remote delete
   * must propagate AND leave the user signed in.
   */
  it("rethrows and keeps the user signed in when the remote delete fails", async () => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await useAuthStore.getState().hydrate();
    jest
      .spyOn(authProvider, "deleteAccount")
      .mockRejectedValueOnce(new AuthError("network", "backend unreachable"));

    await expect(useAuthStore.getState().deleteAccount()).rejects.toMatchObject({
      code: "network",
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(session.user);
    expect(state.isSubmitting).toBe(false);
  });
});

/**
 * Leaving the outgoing user's data in the React Query cache means it is served
 * to whoever signs in next on the same device — it renders before any refetch
 * resolves. On a shared device that is a data leak, and it is a commonly
 * shipped bug.
 */
describe("useAuthStore — query cache is scoped to the session", () => {
  const seedCache = () =>
    queryClient.setQueryData(["private", "data"], { secret: "previous user" });

  beforeEach(() => {
    queryClient.clear();
  });

  // The last test in this block deliberately leaves data cached. Each cached
  // query schedules a garbage-collection timer (gcTime defaults to 5 minutes),
  // and a live timer keeps Jest's event loop open — the suite passes but the
  // process never exits. Clearing destroys the queries and their timers.
  afterAll(() => {
    queryClient.clear();
  });

  it("signOut clears the cache", async () => {
    seedCache();
    await useAuthStore.getState().signOut();
    expect(queryClient.getQueryData(["private", "data"])).toBeUndefined();
  });

  it("signOut clears the cache even when the provider throws", async () => {
    seedCache();
    jest.spyOn(authProvider, "signOut").mockRejectedValueOnce(new Error("network"));
    await useAuthStore.getState().signOut();
    expect(queryClient.getQueryData(["private", "data"])).toBeUndefined();
  });

  it("deleteAccount clears the cache on success", async () => {
    seedCache();
    await useAuthStore.getState().deleteAccount();
    expect(queryClient.getQueryData(["private", "data"])).toBeUndefined();
  });

  // The user is still signed in and still looking at their data, so wiping it
  // here would blank the UI behind the "Couldn't Delete Account" alert.
  it("deleteAccount leaves the cache intact when the remote delete fails", async () => {
    seedCache();
    jest
      .spyOn(authProvider, "deleteAccount")
      .mockRejectedValueOnce(new AuthError("network", "backend unreachable"));

    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow();

    expect(queryClient.getQueryData(["private", "data"])).toEqual({
      secret: "previous user",
    });
  });
});

describe("useAuthStore — init", () => {
  it("returns an unsubscribe function", () => {
    const unsubscribe = useAuthStore.getState().init();
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("applies sessions pushed by the provider out of band", () => {
    let emit: ((s: AuthSession | null) => void) | undefined;
    jest.spyOn(authProvider, "subscribe").mockImplementation((onChange) => {
      emit = onChange;
      return () => {};
    });

    const unsubscribe = useAuthStore.getState().init();

    emit?.(session);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user).toEqual(session.user);

    // e.g. an expiry or a sign-out performed on another device
    emit?.(null);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().session).toBeNull();

    unsubscribe();
  });
});
