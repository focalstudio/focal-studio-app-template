import { create } from "zustand";
import type { User } from "../types";
import { STORAGE_PREFIX } from "../constants";
import { loadJson, saveJson, removeItem } from "../utils/storage";

const AUTH_KEY = `${STORAGE_PREFIX}auth_user`;

type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User) => void;
  signOut: () => void;
  deleteAccount: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => {
    set({ user, isAuthenticated: true });
    saveJson(AUTH_KEY, user);
  },

  signOut: () => {
    set({ user: null, isAuthenticated: false });
    removeItem(AUTH_KEY);
  },

  // Permanently deletes the account. This template has no backend, so the
  // scaffold only clears local state — see step 4 of the wiring notes below.
  //
  // Contract for implementers: if the remote delete fails, THROW. Do not fall
  // through to clearing local state. Signing a user out while their account
  // still exists looks like deletion succeeded and is exactly the failure the
  // Play "Data safety" account-deletion requirement exists to prevent.
  deleteAccount: async () => {
    // 1. Delete the remote account here (throws on failure).
    // 2. Only then clear local state:
    set({ user: null, isAuthenticated: false });
    await removeItem(AUTH_KEY);
  },

  hydrate: async () => {
    const raw = await loadJson<unknown>(AUTH_KEY, null);
    const isValidUser = (v: unknown): v is User =>
      typeof v === "object" && v !== null && "id" in v && "email" in v &&
      typeof (v as User).id === "string" && typeof (v as User).email === "string";
    const user = isValidUser(raw) ? raw : null;
    set({ user, isAuthenticated: user !== null, isLoading: false });
  },
}));

/*
 * To wire in a real auth provider (Firebase, Supabase, custom):
 * 1. Install the SDK (e.g. `npx expo install firebase`)
 * 2. Replace setUser/signOut with SDK auth calls
 * 3. Subscribe to auth state changes in app/_layout.tsx
 * 4. Implement deleteAccount() — call your provider's delete API BEFORE
 *    clearing local state, and throw if it fails so the UI can surface the
 *    error and keep the user signed in.
 *
 *    Supabase: the client SDK cannot call auth.admin.deleteUser, so expose a
 *    SECURITY DEFINER function that deletes the caller's own row and let the
 *    schema's ON DELETE CASCADE constraints clean up the rest:
 *
 *      const { error } = await supabase.rpc("delete_own_account");
 *      if (error) throw error;
 *      await supabase.auth.signOut();
 *
 *    Also purge any app data cached under STORAGE_PREFIX and cancel scheduled
 *    notifications — deleting the account server-side does not clear the device.
 */
