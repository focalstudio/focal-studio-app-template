import React, { useCallback, useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { Divider } from "@/components/layout/Divider";
import { useTheme } from "@/hooks/useTheme";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { setAnalyticsEnabled, Analytics } from "@/services/analytics";
import { maybeRequestRating } from "@/services/ratingService";
import { FontSize, FontWeight, Spacing } from "@/theme";
import { APP_NAME, APP_VERSION, PRIVACY_POLICY_URL, SUPPORT_EMAIL } from "@/constants";
import type { Theme } from "@/types";

const THEMES: { label: string; value: Theme }[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "device" },
];


function Row({
  label,
  onPress,
  destructive,
  disabled,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={disabled ? undefined : onPress}
    >
      <Text style={[styles.rowLabel, { color: destructive ? colors.danger : colors.text }]}>
        {label}
      </Text>
      <Text style={{ color: colors.textTertiary }}>›</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { theme, setTheme, analyticsEnabled, setAnalyticsEnabled: setStoreAnalytics } =
    useAppStore();
  const { signOut, deleteAccount } = useAuthStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      Analytics.screenViewed("settings");
    }, [])
  );

  function handleTheme(t: Theme) {
    setTheme(t);
  }

  function handleAnalyticsToggle(v: boolean) {
    setStoreAnalytics(v);
    setAnalyticsEnabled(v);
  }

  async function handleRateUs() {
    await maybeRequestRating(5, 5);
  }

  async function performDelete() {
    setIsDeleting(true);
    try {
      await deleteAccount();
      // Deliberately no setIsDeleting(false) on this path — the screen is
      // navigating away, and the account no longer exists to retry against.
      router.replace("/(auth)/login");
    } catch (err) {
      // Keep the raw error out of the UI (a backend delete can surface internal
      // database or auth text) but keep it for diagnostics.
      Analytics.appError(err instanceof Error ? err.message : String(err), "deleteAccount");
      // Skip UI + state updates if the screen unmounted mid-request (matches login.tsx).
      if (!isMountedRef.current) return;
      Alert.alert(
        "Couldn't Delete Account",
        "Something went wrong and your account was not deleted. Please try again, or contact support if the problem continues."
      );
      // Stay signed in — the account still exists.
      setIsDeleting(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all associated data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "This is your last chance to cancel — your account and data will be permanently deleted.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete Account", style: "destructive", onPress: performDelete },
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Settings</Text>

        {/* Appearance */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>
          {THEMES.map((t, i) => (
            <View key={t.value}>
              <Toggle
                label={t.label}
                value={theme === t.value}
                onValueChange={() => handleTheme(t.value)}
              />
              {i < THEMES.length - 1 && <Divider />}
            </View>
          ))}
        </Card>

        {/* Privacy */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Privacy</Text>
          <Toggle
            label="Analytics"
            description="Help improve the app by sharing anonymous usage data."
            value={analyticsEnabled}
            onValueChange={handleAnalyticsToggle}
          />
        </Card>

        {/* Support */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Support</Text>
          <Row label="Rate Us" onPress={handleRateUs} />
          <Divider />
          <Row label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} />
          <Divider />
          <Row
            label="Feature Request"
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Feature Request`)}
          />
          <Divider />
          <Row
            label="Request Data Deletion"
            onPress={() =>
              Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Data Deletion Request`)
            }
          />
        </Card>

        {/* Account */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account</Text>
          <Row
            label="Sign Out"
            onPress={() => {
              signOut();
              router.replace("/(auth)/login");
            }}
          />
        </Card>

        {/* Danger Zone */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Danger Zone</Text>
          <Row
            label="Delete Account"
            destructive
            disabled={isDeleting}
            onPress={handleDeleteAccount}
          />
        </Card>

        <Text style={[styles.footer, { color: colors.textTertiary }]}>
          {APP_NAME} v{APP_VERSION} · by Focal Studio
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
  pageTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
  },
  rowDisabled: { opacity: 0.5 },
  rowLabel: { fontSize: FontSize.md },
  footer: { textAlign: "center", fontSize: FontSize.sm },
});
