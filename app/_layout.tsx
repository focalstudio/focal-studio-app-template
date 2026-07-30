import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
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

  // Guards must stay false until hydration settles, or the very first render
  // would route a signed-in user to login before their session is restored.
  const booted = !authLoading && !onboardingLoading;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />

        <Stack.Protected guard={booted && !onboardingComplete}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>

        <Stack.Protected guard={booted && onboardingComplete && !isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={booted && isAuthenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
