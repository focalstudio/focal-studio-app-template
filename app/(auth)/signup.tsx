import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/useAuthStore";
import { FontSize, FontWeight, Spacing } from "@/theme";

export default function SignupScreen() {
  const { colors } = useTheme();
  const { setUser } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      // TODO: replace with real auth call
      setUser({ id: "placeholder", email, name });
      router.replace("/(tabs)");
    } catch {
      setError("Could not create account. Please try again.");
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
