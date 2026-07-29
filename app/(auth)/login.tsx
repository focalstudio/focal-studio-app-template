import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/useAuthStore";
import { authErrorMessage } from "@/services/auth";
import { FontSize, FontWeight, Spacing } from "@/theme";
import { APP_NAME } from "@/constants";

/*
 * This screen is provider-agnostic. It calls the store, the store calls the
 * AuthProvider port, and `scripts/add-backend.sh` swaps which provider that is.
 * Wiring a backend should not require editing this file.
 */

export default function LoginScreen() {
  const { colors } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Navigation is handled by the Stack.Protected guards in app/_layout.tsx —
  // once isAuthenticated flips, the router moves to (tabs) on its own. Calling
  // router.replace here as well would race those guards.
  async function runAuth(action: () => Promise<unknown>) {
    setError("");
    setLoading(true);
    try {
      await action();
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error) console.error("[Auth]", err.message);
      setError(authErrorMessage(err));
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    await runAuth(() => signIn(email, password));
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{APP_NAME}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Sign in to your account
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="••••••••"
            error={error}
          />
          <Pressable onPress={() => router.push("/(auth)/forgot-password")}>
            <Text style={[styles.link, { color: colors.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>

        <Button label="Sign In" onPress={handleLogin} loading={loading} />

        <View style={styles.dividerRow}>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
          <Text style={[styles.or, { color: colors.textTertiary }]}>or</Text>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
        </View>

        {/*
          These call optional methods on the AuthProvider port. The local
          scaffold omits them, so both surface "not configured" rather than
          silently doing nothing — a dead button is indistinguishable from a
          broken one, and it used to ship that way in every new app.
          Full Apple + Google wiring lives in the social sign-in recipe.
        */}
        <Button
          label="Continue with Apple"
          variant="secondary"
          onPress={() => runAuth(signInWithApple)}
        />
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={() => runAuth(signInWithGoogle)}
        />

        <Pressable onPress={() => router.push("/(auth)/signup")} style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            {"Don't have an account?"}{" "}
            <Text style={{ color: colors.accent, fontWeight: FontWeight.semibold }}>
              Sign up
            </Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg, gap: Spacing.lg, justifyContent: "center" },
  header: { gap: Spacing.xs },
  title: { fontSize: FontSize.display, fontWeight: FontWeight.bold },
  subtitle: { fontSize: FontSize.md },
  form: { gap: Spacing.md },
  link: { fontSize: FontSize.sm, textAlign: "right" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  line: { flex: 1, height: 1 },
  or: { fontSize: FontSize.sm },
  footer: { alignItems: "center" },
  footerText: { fontSize: FontSize.md },
});
