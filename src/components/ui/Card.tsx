import React from "react";
import { View, StyleSheet, type ViewProps } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { Radius, Shadow, Spacing } from "../../theme";

type Props = ViewProps & {
  children: React.ReactNode;
  elevated?: boolean;
};

export function Card({ children, style, elevated = false, ...props }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        elevated ? Shadow.elevated : Shadow.card,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
  },
});
