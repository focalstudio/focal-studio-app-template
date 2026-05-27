import { Redirect } from "expo-router";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useAuthStore } from "@/store/useAuthStore";
import { View, ActivityIndicator } from "react-native";

export default function Root() {
  const { isComplete: onboardingComplete, isLoading: onboardingLoading } =
    useOnboardingStore();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  if (onboardingLoading || authLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)" />;
}
