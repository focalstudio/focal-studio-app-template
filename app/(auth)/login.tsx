import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/useAuthStore";
import { FontSize, FontWeight, Spacing } from "@/theme";
import { APP_NAME } from "@/constants";

/*
 * Wire in real auth: replace handleLogin with your provider's sign-in call,
 * then call setUser with the returned user object.
 */

export default function LoginScreen() {
  const { colors } = useTheme();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      // TODO: replace with real auth call
      // e.g. const user = await signInWithEmailAndPassword(auth, email, password);
      setUser({ id: "placeholder", email });
      router.replace("/(tabs)");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
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

        {/* Placeholder social auth buttons — wire in Apple/Google Sign-In */}
        <Button label="Continue with Apple" variant="secondary" onPress={() => {}} />
        <Button label="Continue with Google" variant="secondary" onPress={() => {}} />

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
