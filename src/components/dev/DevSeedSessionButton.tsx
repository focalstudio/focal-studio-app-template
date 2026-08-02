import React, { useRef, useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/useAuthStore";
import { seedLocalSession } from "@/services/auth/local";
import type { AuthSession } from "@/services/auth/types";
import { isDevBuild, backend } from "@/env";
import { FontSize, FontWeight, Spacing } from "@/theme";

/**
 * Dev-only control that puts the app into a signed-in state with no backend
 * wired, so a UI driver (Maestro, #80) can get past the auth wall without a
 * real account.
 *
 * This writes directly to the local auth scaffold's storage key via
 * `seedLocalSession`, then re-hydrates through the real `authProvider.getSession()`
 * path — it does not poke `useAuthStore` state directly, so it exercises the
 * same restore path a real launch would.
 */

const DEV_SESSION: AuthSession = {
  accessToken: "dev-seed",
  refreshToken: null,
  expiresAt: null, // never expires — isSessionExpired() must not evict it
  user: { id: "dev-seed-user", email: "dev@example.test", name: "Dev User" },
};

export function DevSeedSessionButton() {
  // Hooks must be declared before the gate below (rules-of-hooks) even though
  // the component renders nothing when the gate trips.
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // The gate is the whole point of this component.
  // - `!isDevBuild` keeps it unreachable in a store build (see src/env.ts).
  // - `backend !== "none"` bails once a real provider is wired: seeding writes
  //   the local scaffold's AsyncStorage key, which a real provider's
  //   `getSession()` never reads, so the button would be a lie.
  if (!isDevBuild || backend !== "none") return null;

  async function handlePress() {
    setError("");
    setLoading(true);
    try {
      await seedLocalSession(DEV_SESSION);
      await useAuthStore.getState().hydrate();
      // No router navigation here: Stack.Protected in app/_layout.tsx moves to
      // (tabs) on its own once isAuthenticated flips (see the comment at
      // app/(auth)/login.tsx ~line 47 explaining why navigating here would race
      // those guards).
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : "Could not seed dev session.");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Button
        variant="secondary"
        label="Seed Dev Session"
        onPress={handlePress}
        loading={loading}
        disabled={loading}
        testID="dev-seed-session"
      />
      <Text style={[styles.caption, { color: colors.textSecondary }]}>
        Dev only — signs you in locally with no backend, for UI testing.
      </Text>
      {error !== "" && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs },
  caption: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    textAlign: "center",
  },
  error: {
    fontSize: FontSize.sm,
    textAlign: "center",
  },
});
