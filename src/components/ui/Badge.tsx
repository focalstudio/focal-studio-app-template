import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { FontSize, FontWeight, Spacing, Radius } from "../../theme";

type Props = {
  label: string;
  variant?: "accent" | "success" | "warning" | "danger";
};

export function Badge({ label, variant = "accent" }: Props) {
  const { colors } = useTheme();
  const bg = {
    accent: colors.accent,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  }[variant];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  label: {
    color: "#FFFFFF",
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
