import { QueryClient, focusManager } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";

/**
 * The app's single QueryClient.
 *
 * Exported rather than created inside a component so non-React code — most
 * importantly the auth store's sign-out path — can clear the cache. See
 * `clearQueryCache()` below for why that matters.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mobile networks are slow and flaky; a short stale window avoids
      // refetching on every screen focus while still feeling live.
      staleTime: 30_000,
      retry: 2,
      // React Query's web default listens for window focus events. On native
      // there is no window — the bridge below feeds it real app-state changes.
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Mutations are not idempotent by default. Retrying a failed POST can
      // double-charge or double-post; opt in per-mutation instead.
      retry: 0,
    },
  },
});

/**
 * Wipes every cached query.
 *
 * Call this on sign-out and account deletion. Without it, the previous user's
 * data stays cached and is served to the *next* user who signs in on the same
 * device — it renders before any refetch resolves. This is a real and commonly
 * shipped bug, and on a shared device it is a data leak.
 */
export function clearQueryCache(): void {
  queryClient.clear();
}

/**
 * Bridges React Native's app state into React Query, which otherwise waits on
 * browser `window` focus events that never fire here. Without this,
 * `refetchOnWindowFocus` silently does nothing on device.
 *
 * Returns a teardown that removes the listener. Called once from
 * `app/_layout.tsx`, whose effect cleanup invokes it.
 *
 * Not wired here: `onlineManager`. Pausing queries while offline needs a
 * connectivity source (`@react-native-community/netinfo` or `expo-network`),
 * and the template does not add that dependency for every app. Wire it in your
 * app if you need offline-aware refetching.
 */
export function initQueryFocusBridge(): () => void {
  const subscription = AppState.addEventListener(
    "change",
    (status: AppStateStatus) => {
      // The web build keeps React Query's own focus handling.
      if (Platform.OS !== "web") {
        focusManager.setFocused(status === "active");
      }
    }
  );

  return () => subscription.remove();
}
