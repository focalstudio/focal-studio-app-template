import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, initQueryFocusBridge } from "@/lib/queryClient";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { usePaywallStore } from "@/store/usePaywallStore";
import { initAnalytics } from "@/services/analytics";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hydrateApp = useAppStore((s) => s.hydrate);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const hydratePaywall = usePaywallStore((s) => s.hydrate);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const authError = useAuthStore((s) => s.hydrationError);
  const onboardingComplete = useOnboardingStore((s) => s.isComplete);
  const onboardingLoading = useOnboardingStore((s) => s.isLoading);

  useEffect(() => {
    initAnalytics();
    Promise.all([hydrateApp(), hydrateAuth(), hydrateOnboarding(), hydratePaywall()])
      .finally(() => SplashScreen.hideAsync());
  }, [hydrateApp, hydrateAuth, hydrateOnboarding, hydratePaywall]);

  // Subscribe to out-of-band session changes (token refresh, expiry, sign-out
  // on another device). init() returns the provider's unsubscribe, which
  // becomes this effect's cleanup — see "Cleanup contracts" in expo-services.
  useEffect(() => useAuthStore.getState().init(), []);

  // Same contract for entitlements: renewals, expiries, a purchase made on
  // another device, and — the one with no other path back into the app — a
  // deferred (Ask-to-Buy) purchase finally being approved.
  useEffect(() => usePaywallStore.getState().init(), []);

  // Feeds app-state changes to React Query, which otherwise waits on browser
  // window focus events that never fire on native.
  useEffect(() => initQueryFocusBridge(), []);

  // Guards must stay false until hydration settles, or the very first render
  // would route a signed-in user to login before their session is restored.
  const booted = !authLoading && !onboardingLoading;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />

        {/*
          Network failure wins over onboarding/auth routing: we couldn't
          verify anything, so neither "show login" nor "show the app" is
          safe. Blocks behind a retry screen instead of guessing.
        */}
        <Stack.Protected guard={booted && authError === "network"}>
          <Stack.Screen name="network-error" />
        </Stack.Protected>

        <Stack.Protected guard={booted && authError !== "network" && !onboardingComplete}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>

        <Stack.Protected
          guard={booted && authError !== "network" && onboardingComplete && !isAuthenticated}
        >
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={booted && authError !== "network" && isAuthenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        </Stack.Protected>
      </Stack>
    </QueryClientProvider>
  );
}
