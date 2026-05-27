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
 */
