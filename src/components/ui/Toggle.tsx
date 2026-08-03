import React from "react";
import { Switch, StyleSheet, View, Text } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { FontSize, FontWeight, Spacing } from "../../theme";
import { hapticTap } from "../../services/haptics";

type Props = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label?: string;
  description?: string;
  /**
   * Addresses the switch itself in an E2E flow. The label is a plain `Text`
   * and isn't pressable, so without this a Maestro `tapOn` has nothing to
   * match — and an unmatched `tapOn` reports COMPLETED while tapping nothing.
   */
  testID?: string;
};

export function Toggle({ value, onValueChange, label, description, testID }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {(label || description) && (
        <View style={styles.textGroup}>
          {label && (
            <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          )}
          {description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {description}
            </Text>
          )}
        </View>
      )}
      <Switch
        testID={testID}
        value={value}
        onValueChange={(v) => {
          hapticTap();
          onValueChange(v);
        }}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  textGroup: { flex: 1, marginRight: Spacing.md },
  label: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  description: { fontSize: FontSize.sm, marginTop: 2 },
});
