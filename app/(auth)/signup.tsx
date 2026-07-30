import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/useAuthStore";
import { authErrorMessage } from "@/services/auth";
import { FontSize, FontWeight, Spacing } from "@/theme";

export default function SignupScreen() {
  const { colors } = useTheme();
  const signUp = useAuthStore((s) => s.signUp);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function handleSignup() {
    setError("");
    if (!name || !email || !password || !confirm) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const signedIn = await signUp(email, password, name);
      if (!isMountedRef.current) return;
      if (!signedIn) {
        // Provider requires email confirmation — there is no session yet, so
        // the Stack.Protected guards will keep us in (auth). Say so explicitly
        // instead of leaving the user on a form that looks like it failed.
        Alert.alert(
          "Check your email",
          "We sent you a confirmation link. Open it to finish creating your account, then sign in."
        );
        router.replace("/(auth)/login");
        return;
      }
      // Signed in — the Stack.Protected guard in app/_layout.tsx routes to
      // (tabs) on its own. No router call here, or it races the guard.
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error) console.error("[Auth]", err.message);
      setError(authErrorMessage(err));
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Get started for free
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput label="Name" value={name} onChangeText={setName} placeholder="Your name" />
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
            textContentType="newPassword"
            placeholder="At least 8 characters"
          />
          <TextInput
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
            placeholder="Repeat password"
            error={error}
          />
        </View>

        <Button label="Create Account" onPress={handleSignup} loading={loading} />

        <Pressable onPress={() => router.back()} style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Already have an account?{" "}
            <Text style={{ color: colors.accent, fontWeight: FontWeight.semibold }}>
              Sign in
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
  title: { fontSize: FontSize.xxxl, fontWeight: FontWeight.bold },
  subtitle: { fontSize: FontSize.md },
  form: { gap: Spacing.md },
  footer: { alignItems: "center" },
  footerText: { fontSize: FontSize.md },
});
