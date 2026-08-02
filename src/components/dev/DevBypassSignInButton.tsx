import React, { useRef, useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/useAuthStore";
import { authErrorMessage } from "@/services/auth";
import { env, isDevBuild, backend } from "@/env";
import { FontSize, FontWeight, Spacing } from "@/theme";

/**
 * Dev-only control that signs in as a dedicated throwaway account, so you don't
 * retype credentials on every reload while working behind the auth wall.
 *
 * The complement of `DevSeedSessionButton`: that one fakes a session locally and
 * only works with no backend wired. This one goes through the real
 * `signIn()` → AuthProvider path, so the app ends up with a genuine session and
 * a real JWT. That distinction is the whole point — a faked `isAuthenticated`
 * gets you past the redirect in app/index.tsx, but every RLS-protected query
 * then comes back empty with nothing to show for it.
 *
 * The credentials are read from the manifest, never from `process.env`: see the
 * comment in src/env.ts's `readEnv()` for why that matters here specifically.
 * `stripDevBypass()` in app.config.js keeps them out of the manifest of a
 * store-bound build, so this gate is not the only thing standing between a dev
 * password and the App Store.
 */

export function DevBypassSignInButton() {
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
  // - `!isDevBuild` keeps it unreachable in a store build (see src/env.ts), and
  //   `stripDevBypass()` in app.config.js drops the credential from that build
  //   too — the button being hidden is not on its own enough.
  // - `backend === "none"` bails before a provider is wired: `signIn()` throws
  //   `not_wired` there, and DevSeedSessionButton owns that case.
  // - No credentials means nothing to sign in with.
  // Read per render rather than captured at module scope, so this stays as easy
  // to exercise as the two constants beside it.
  const email = env.EXPO_PUBLIC_DEV_BYPASS_EMAIL;
  const password = env.EXPO_PUBLIC_DEV_BYPASS_PASSWORD;
  if (!isDevBuild || backend === "none" || !email || !password) return null;

  // Takes the credentials rather than closing over them: the gate above has
  // already proven they are strings, but a hoisted function declaration doesn't
  // inherit that narrowing.
  async function handlePress(bypassEmail: string, bypassPassword: string) {
    setError("");
    setLoading(true);
    try {
      await useAuthStore.getState().signIn(bypassEmail, bypassPassword);
      // No router navigation here: Stack.Protected in app/_layout.tsx moves to
      // (tabs) on its own once isAuthenticated flips (see the comment at
      // app/(auth)/login.tsx ~line 47 explaining why navigating here would race
      // those guards).
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error) console.error("[Auth]", err.message);
      setError(authErrorMessage(err));
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Button
        variant="secondary"
        label="Skip Sign-In (Dev)"
        onPress={() => handlePress(email, password)}
        loading={loading}
        disabled={loading}
        testID="dev-bypass-signin"
      />
      <Text style={[styles.caption, { color: colors.textSecondary }]}>
        Dev only — signs in as {email}.
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
