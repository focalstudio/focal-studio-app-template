import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryClient } from "../../lib/queryClient";
import { AuthError } from "../../services/auth/types";
import type { AuthProvider, AuthSession } from "../../services/auth/types";

/**
 * Tests the store's own logic, not any provider's.
 *
 * The auth barrel is mocked deliberately. It used to be imported for real, so
 * these tests silently exercised whichever provider was active — which meant
 * they only passed while the template had no backend. After
 * `scripts/add-backend.sh` runs, the barrel pulls in the Supabase adapter,
 * whose `expo-sqlite` import cannot load under Jest, and the whole suite fails
 * to run. The scaffold's own behaviour is covered in
 * `src/services/auth/__tests__/local.test.ts`, against `local.ts` directly.
 *
 * `AuthError` comes from the real `types.ts` — the store branches on
 * `instanceof`, so a stubbed class would make the cancellation tests pass for
 * the wrong reason.
 */

const session: AuthSession = {
  accessToken: "token",
  refreshToken: "refresh",
  expiresAt: null,
  user: { id: "1", email: "a@b.c", name: "Ada" },
};

/**
 * The provider the store sees.
 *
 * Its *identity* has to stay stable — the store captures `authProvider` once at
 * module load, and Jest evaluates a mock factory only once, so handing back a
 * fresh object (or a getter) per test would leave the store holding the
 * original. Tests mutate this object in place instead, and `beforeEach` wipes
 * it back to `baseProvider()` so one test's stubs can't leak into the next.
 */
const mockProvider = {} as AuthProvider & Record<string, unknown>;

function baseProvider(): AuthProvider {
  return {
    name: "mock",
    getSession: jest.fn().mockResolvedValue(null),
    signIn: jest.fn().mockResolvedValue(session),
    signUp: jest.fn().mockResolvedValue(session),
    signOut: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  };
}

/** Wipes in place, so the object the store holds is the object we configure. */
function resetProvider() {
  for (const key of Object.keys(mockProvider)) delete mockProvider[key];
  Object.assign(mockProvider, baseProvider());
}

jest.mock("../../services/auth", () => ({
  ...jest.requireActual("../../services/auth/types"),
  authErrorMessage: jest.requireActual("../../services/auth/messages").authErrorMessage,
  authProvider: mockProvider,
}));

// Imported after the mock is registered.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require("../useAuthStore") as typeof import("../useAuthStore");

const initialState = useAuthStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useAuthStore.setState(initialState, true);
  resetProvider();
  jest.restoreAllMocks();
});

describe("useAuthStore — hydration", () => {
  it("ends signed out and clears isLoading when there is no session", async () => {
    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it("adopts a restored session", async () => {
    mockProvider.getSession = jest.fn().mockResolvedValue(session);

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.session).toEqual(session);
    expect(state.user).toEqual(session.user);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  // A provider that throws at boot (offline, corrupt keychain) must not trap
  // the user behind the splash screen, which waits on isLoading.
  it("clears isLoading even when the provider throws", async () => {
    mockProvider.getSession = jest.fn().mockRejectedValue(new Error("offline"));

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});

describe("useAuthStore — submitting", () => {
  it("signUp reports a pending confirmation without signing the user in", async () => {
    mockProvider.signUp = jest.fn().mockResolvedValue(null);

    await expect(useAuthStore.getState().signUp("a@b.c", "pw", "Ada")).resolves.toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("signUp returns true when the provider issues a session", async () => {
    await expect(useAuthStore.getState().signUp("a@b.c", "pw", "Ada")).resolves.toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it.each(["signIn", "resetPassword"] as const)(
    "%s propagates the provider's error and resets isSubmitting",
    async (method) => {
      mockProvider[method] = jest.fn().mockRejectedValue(new AuthError("network", "offline"));

      await expect(
        method === "signIn"
          ? useAuthStore.getState().signIn("a@b.c", "pw")
          : useAuthStore.getState().resetPassword("a@b.c")
      ).rejects.toMatchObject({ code: "network" });

      expect(useAuthStore.getState().isSubmitting).toBe(false);
    }
  );
});

describe("useAuthStore — social sign-in", () => {
  type SocialMethod = "signInWithApple" | "signInWithGoogle";
  const methods: SocialMethod[] = ["signInWithApple", "signInWithGoogle"];

  // A provider that omits these signals "not configured", and the UI surfaces
  // that rather than rendering a button that does nothing.
  it.each(methods)("%s throws not_wired when the provider omits it", async (method) => {
    await expect(useAuthStore.getState()[method]()).rejects.toMatchObject({
      code: "not_wired",
    });
  });

  // Dismissing the Apple sheet is a deliberate user action. The action must
  // resolve, not reject: a rejection would surface a red error for a tap the
  // user took back on purpose.
  it.each(methods)("%s resolves silently when the user cancels", async (method) => {
    mockProvider[method] = jest.fn().mockRejectedValue(new AuthError("cancelled", "cancelled"));

    await expect(useAuthStore.getState()[method]()).resolves.toBeUndefined();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.session).toBeNull();
    expect(state.isSubmitting).toBe(false);
  });

  it.each(methods)("%s still rejects on a real failure", async (method) => {
    mockProvider[method] = jest.fn().mockRejectedValue(new AuthError("network", "offline"));

    await expect(useAuthStore.getState()[method]()).rejects.toMatchObject({
      code: "network",
    });
    expect(useAuthStore.getState().isSubmitting).toBe(false);
  });

  it.each(methods)("%s adopts the session on success", async (method) => {
    mockProvider[method] = jest.fn().mockResolvedValue(session);

    await useAuthStore.getState()[method]();

    const state = useAuthStore.getState();
    expect(state.session).toEqual(session);
    expect(state.user).toEqual(session.user);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isSubmitting).toBe(false);
  });
});

describe("useAuthStore — signOut", () => {
  it("clears session and user", async () => {
    mockProvider.getSession = jest.fn().mockResolvedValue(session);
    await useAuthStore.getState().hydrate();

    await useAuthStore.getState().signOut();

    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  // Signing out must always work locally. A provider that can't reach the
  // server would otherwise strand the user in a signed-in UI.
  it("clears local state even when the provider throws", async () => {
    mockProvider.getSession = jest.fn().mockResolvedValue(session);
    await useAuthStore.getState().hydrate();
    mockProvider.signOut = jest.fn().mockRejectedValue(new Error("network"));

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe("useAuthStore — deleteAccount contract", () => {
  it("clears local state on success", async () => {
    mockProvider.getSession = jest.fn().mockResolvedValue(session);
    await useAuthStore.getState().hydrate();

    await useAuthStore.getState().deleteAccount();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  // The load-bearing one. Signing someone out while their account still exists
  // is indistinguishable from a successful deletion, and is exactly what
  // Google Play's Data safety account-deletion requirement exists to prevent.
  it("rethrows and keeps the user signed in when the remote delete fails", async () => {
    mockProvider.getSession = jest.fn().mockResolvedValue(session);
    await useAuthStore.getState().hydrate();
    mockProvider.deleteAccount = jest
      .fn()
      .mockRejectedValue(new AuthError("network", "backend unreachable"));

    await expect(useAuthStore.getState().deleteAccount()).rejects.toMatchObject({
      code: "network",
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

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
    mockProvider.signOut = jest.fn().mockRejectedValue(new Error("network"));
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
    mockProvider.deleteAccount = jest
      .fn()
      .mockRejectedValue(new AuthError("network", "backend unreachable"));

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
  });

  // Token refresh, expiry, or a sign-out on another device all arrive here
  // rather than through an action the user took in this app.
  it("applies sessions delivered out of band", () => {
    let emit: ((s: AuthSession | null) => void) | undefined;
    mockProvider.subscribe = jest.fn((onChange) => {
      emit = onChange;
      return () => {};
    });

    useAuthStore.getState().init();
    emit?.(session);

    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    emit?.(null);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
