import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Screen } from "@/components/layout/Screen";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/hooks/useTheme";
import { FontSize, FontWeight, Spacing } from "@/theme";
import { APP_NAME } from "@/constants";
import { Analytics } from "@/services/analytics";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

export default function HomeScreen() {
  const { colors } = useTheme();

  useFocusEffect(
    useCallback(() => {
      Analytics.screenViewed("home");
    }, [])
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{APP_NAME}</Text>
        </View>

        {/* Replace this placeholder card with your app's home screen content */}
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Welcome</Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            This is your home screen. Replace this card with your app&apos;s main content.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.lg, gap: Spacing.lg },
  header: { paddingVertical: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold },
  cardTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, marginBottom: Spacing.xs },
  cardBody: { fontSize: FontSize.md, lineHeight: FontSize.md * 1.5 },
});
