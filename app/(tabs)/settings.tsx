import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
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
import { APP_NAME, APP_VERSION, PRIVACY_POLICY_URL } from "@/constants";
import type { Theme } from "@/types";

const THEMES: { label: string; value: Theme }[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "device" },
];


function Row({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Text style={{ color: colors.textTertiary }}>›</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { theme, setTheme, analyticsEnabled, setAnalyticsEnabled: setStoreAnalytics } =
    useAppStore();
  const { signOut } = useAuthStore();

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
            onPress={() => Linking.openURL("mailto:focalstudio.apps@gmail.com?subject=Feature Request")}
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
  rowLabel: { fontSize: FontSize.md },
  footer: { textAlign: "center", fontSize: FontSize.sm },
});
