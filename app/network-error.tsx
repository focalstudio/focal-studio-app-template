import React, { useRef, useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { WifiOff } from "lucide-react-native";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/useAuthStore";
import { authErrorMessage } from "@/services/auth";
import { AuthError } from "@/services/auth/types";
import { FontSize, FontWeight, Spacing } from "@/theme";

/**
 * Shown when `hydrate()` couldn't reach the network to verify a stored
 * session — not when the user is actually signed out. `app/_layout.tsx`
 * routes here instead of `(auth)` so a flaky connection never looks like a
 * silent sign-out. Retrying re-runs `hydrate()`; on success the store clears
 * `hydrationError` and `_layout.tsx`'s guards re-route on their own.
 */
export default function NetworkErrorScreen() {
  const { colors } = useTheme();
  const hydrate = useAuthStore((s) => s.hydrate);
  const [retrying, setRetrying] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function handleRetry() {
    setRetrying(true);
    try {
      await hydrate();
    } finally {
      if (isMountedRef.current) setRetrying(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <WifiOff size={48} color={colors.textSecondary} />
        <Text style={[styles.title, { color: colors.text }]}>No Connection</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {authErrorMessage(new AuthError("network", ""))}
        </Text>
        <Button label="Retry" onPress={handleRetry} loading={retrying} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold },
  subtitle: { fontSize: FontSize.md, textAlign: "center" },
});
