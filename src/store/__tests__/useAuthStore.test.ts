import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../useAuthStore";
import { STORAGE_PREFIX } from "../../constants";

const AUTH_KEY = `${STORAGE_PREFIX}auth_user`;

const initialState = useAuthStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useAuthStore.setState(initialState, true);
});

describe("useAuthStore", () => {
  it("setUser sets user and isAuthenticated, and persists it", async () => {
    const user = { id: "1", email: "a@b.c" };
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(await AsyncStorage.getItem(AUTH_KEY)).toBe(JSON.stringify(user));
  });

  it("signOut clears user and removes persisted key", async () => {
    useAuthStore.getState().setUser({ id: "1", email: "a@b.c" });
    useAuthStore.getState().signOut();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(await AsyncStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it("hydrate with no stored key results in signed-out state and isLoading false", async () => {
    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it("hydrate restores a valid persisted user", async () => {
    const user = { id: "1", email: "a@b.c" };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user));
    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("deleteAccount clears user, isAuthenticated, and persisted storage", async () => {
    useAuthStore.getState().setUser({ id: "1", email: "a@b.c" });
    await useAuthStore.getState().deleteAccount();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(await AsyncStorage.getItem(AUTH_KEY)).toBeNull();
  });

  const malformed: [string, unknown][] = [
    ["empty object", {}],
    ["non-string id", { id: 1, email: "a@b.c" }],
    ["missing email", { id: "x" }],
    ["a raw string", "a string"],
    ["null", null],
  ];

  it.each(malformed)(
    "hydrate rejects malformed persisted user (%s) and still clears isLoading",
    async (_desc, raw) => {
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(raw));
      await useAuthStore.getState().hydrate();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    }
  );
});
