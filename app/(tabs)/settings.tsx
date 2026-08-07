import React, { useCallback, useState, useRef, useEffect } from "react";
import { Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
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

/**
 * What the Dark Mode switch says underneath itself, keyed by whether the stored
 * theme is still the `"device"` default.
 *
 * The switch is bound to the *resolved* appearance (`useTheme().isDark`), so its
 * position cannot tell you what was stored — on a dark device it reads "on"
 * before anything has ever been written. This description can, which is why
 * `.maestro/persistence.yaml` round-trips it rather than the switch state.
 *
 * `testID` is spelled out per entry rather than built from the key, so that a
 * grep for `theme-set-manually` finds this file — `src/__tests__/e2e-contract.test.ts`
 * greps for exactly that. These are E2E seams: see "The seams the flows depend
 * on" in docs/testing.md.
 */
const THEME_STATE = {
  device: {
    description: "Following your device appearance.",
    testID: "theme-following-device",
  },
  manual: {
    description: "Set manually.",
    testID: "theme-set-manually",
  },
} as const;


function Row({
  label,
  onPress,
  destructive,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Addresses this row in an E2E flow, independently of its label copy. */
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
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
  const { colors, isDark } = useTheme();
  const { theme, setTheme, analyticsEnabled, setAnalyticsEnabled: setStoreAnalytics } =
    useAppStore();
  const themeState = theme === "device" ? THEME_STATE.device : THEME_STATE.manual;
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
      // Navigation itself is the Stack.Protected guard's job: isAuthenticated
      // just went false, so the router leaves (tabs) and purges the history.
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
        <Text testID="settings-title" style={[styles.pageTitle, { color: colors.text }]}>
          Settings
        </Text>

        {/* Appearance */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>
          {/*
            One switch, not three. Three switches where at most one can be on is
            a radio group wearing a control that means on/off on iOS (#129).

            `"device"` stays the persisted default and the `hydrate` fallback —
            it just stops being *selectable*. It is the pre-touch state: the
            switch mirrors the device until first touch, and that flip writes an
            explicit "light"/"dark" that wins from then on. There is deliberately
            no way back to "device" once touched.
          */}
          <Toggle
            testID="theme-dark-mode"
            label="Dark Mode"
            description={themeState.description}
            descriptionTestID={themeState.testID}
            value={isDark}
            onValueChange={(v) => setTheme(v ? "dark" : "light")}
          />
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
          {/* The Stack.Protected guard handles navigation once the session
              clears — no router.replace, which would race it. */}
          <Row label="Sign Out" onPress={() => void signOut()} />
        </Card>

        {/* Danger Zone */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Danger Zone</Text>
          {/*
            E2E seam: the flow scrolls to and taps this row by id. It used to
            match on "Delete Account.*" — the wildcard was there to absorb the
            trailing chevron the row renders into its accessible label.
          */}
          <Row
            testID="settings-delete-account"
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
