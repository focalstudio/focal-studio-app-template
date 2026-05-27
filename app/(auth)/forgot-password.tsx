import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { useTheme } from "@/hooks/useTheme";
import { FontSize, FontWeight, Spacing } from "@/theme";

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset() {
    if (!email) return;
    setLoading(true);
    try {
      // TODO: replace with real password reset call
      // e.g. await sendPasswordResetEmail(auth, email);
      setSent(true);
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
          <Text style={[styles.title, { color: colors.text }]}>Reset password</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {sent
              ? "Check your email for a reset link."
              : "Enter your email and we'll send you a reset link."}
          </Text>
        </View>

        {!sent && (
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
        )}

        {!sent ? (
          <Button label="Send Reset Link" onPress={handleReset} loading={loading} />
        ) : (
          <Button label="Back to Sign In" onPress={() => router.replace("/(auth)/login")} />
        )}

        {!sent && (
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg, gap: Spacing.lg, justifyContent: "center" },
  header: { gap: Spacing.xs },
  title: { fontSize: FontSize.xxxl, fontWeight: FontWeight.bold },
  subtitle: { fontSize: FontSize.md },
});
