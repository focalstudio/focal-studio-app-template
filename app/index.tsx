import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Entry anchor. Picks the destination once hydration settles; the
 * `Stack.Protected` guards in `_layout.tsx` are what keep the user there.
 *
 * Both pieces are needed: this redirects on first launch, the guards react to
 * auth changing mid-session and purge history so a back-swipe can't return to
 * a screen the user is no longer entitled to.
 */
export default function Root() {
  const onboardingComplete = useOnboardingStore((s) => s.isComplete);
  const onboardingLoading = useOnboardingStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const authError = useAuthStore((s) => s.hydrationError);

  if (onboardingLoading || authLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Mirrors the guard order in `_layout.tsx`: a network failure means we
  // couldn't verify anything, so it wins over onboarding/auth routing rather
  // than redirecting toward a group `_layout.tsx` has left unguarded.
  if (authError === "network") return <Redirect href="/network-error" />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)" />;
}
