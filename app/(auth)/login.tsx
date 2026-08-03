import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { SocialSignInButton } from "@/components/ui/SocialSignInButton";
import { TextInput } from "@/components/ui/TextInput";
import { DevSeedSessionButton } from "@/components/dev/DevSeedSessionButton";
import { DevBypassSignInButton } from "@/components/dev/DevBypassSignInButton";
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

/** Which control triggered the in-flight request, so only it spins. */
type Source = "password" | "apple" | "google";

export default function LoginScreen() {
  const { colors } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Which control is mid-flight. A single shared flag would spin all three
  // buttons at once, which reads as the whole screen being stuck.
  const [pending, setPending] = useState<Source | null>(null);
  // Two error slots, because they render in different places. Routing a failed
  // Apple sign-in into the password field's error prop blames an input the
  // user never touched.
  const [formError, setFormError] = useState("");
  const [socialError, setSocialError] = useState("");
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Navigation is handled by the Stack.Protected guards in app/_layout.tsx —
  // once isAuthenticated flips, the router moves to (tabs) on its own. Calling
  // router.replace here as well would race those guards.
  async function runAuth(action: () => Promise<unknown>, source: Source) {
    setFormError("");
    setSocialError("");
    setPending(source);
    try {
      await action();
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error) console.error("[Auth]", err.message);
      const message = authErrorMessage(err);
      if (source === "password") setFormError(message);
      else setSocialError(message);
    } finally {
      if (isMountedRef.current) setPending(null);
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      setFormError("Please fill in all fields.");
      return;
    }
    await runAuth(() => signIn(email, password), "password");
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
            error={formError}
          />
          <Pressable onPress={() => router.push("/(auth)/forgot-password")}>
            <Text style={[styles.link, { color: colors.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>

        <Button
          label="Sign In"
          onPress={handleLogin}
          loading={pending === "password"}
          disabled={pending !== null}
        />

        <View style={styles.dividerRow}>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
          <Text style={[styles.or, { color: colors.textTertiary }]}>or</Text>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
        </View>

        {/*
          These call optional methods on the AuthProvider port. Until
          `bash scripts/add-social-auth.sh` composes an implementation on, they
          surface "not configured" rather than silently doing nothing — a dead
          button is indistinguishable from a broken one, and it used to ship
          that way in every new app.

          Apple is iOS-only: the recipe uses the native sheet, so on Android the
          button could only ever fail, which is the dead-button problem again.
        */}
        {Platform.OS === "ios" && (
          <SocialSignInButton
            provider="apple"
            onPress={() => runAuth(signInWithApple, "apple")}
            loading={pending === "apple"}
            disabled={pending !== null}
          />
        )}
        <SocialSignInButton
          provider="google"
          onPress={() => runAuth(signInWithGoogle, "google")}
          loading={pending === "google"}
          disabled={pending !== null}
        />

        {socialError !== "" && (
          <Text style={[styles.socialError, { color: colors.danger }]}>{socialError}</Text>
        )}

        {/*
          Both gate themselves and are mutually exclusive — the seed button only
          renders with no backend wired, the bypass button only with one. Kept
          adjacent so there is a single place to audit what a dev build adds to
          this screen.
        */}
        <DevSeedSessionButton />
        <DevBypassSignInButton />

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
  socialError: { fontSize: FontSize.sm, textAlign: "center" },
  footer: { alignItems: "center" },
  footerText: { fontSize: FontSize.md },
});
