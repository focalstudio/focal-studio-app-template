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
  const { scheme } = useAppStore((s) => ({ scheme: s.theme }));

  useEffect(() => {
    initAnalytics();
    Promise.all([hydrateApp(), hydrateAuth(), hydrateOnboarding(), hydratePaywall()])
      .finally(() => SplashScreen.hideAsync());
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
