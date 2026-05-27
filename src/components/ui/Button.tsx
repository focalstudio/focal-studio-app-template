import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { FontSize, FontWeight, Spacing, Radius } from "../../theme";
import { hapticTap } from "../../services/haptics";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  style,
  ...props
}: Props) {
  const { colors } = useTheme();

  const bg = {
    primary: colors.accent,
    secondary: colors.surface,
    ghost: "transparent",
    destructive: colors.danger,
  }[variant];

  const fg = {
    primary: "#FFFFFF",
    secondary: colors.text,
    ghost: colors.accent,
    destructive: "#FFFFFF",
  }[variant];

  const height = { sm: 36, md: 48, lg: 56 }[size];
  const fontSize = { sm: FontSize.sm, md: FontSize.md, lg: FontSize.lg }[size];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, height, borderRadius: Radius.md, opacity: pressed || disabled ? 0.6 : 1 },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.border },
        style as ViewStyle,
      ] as StyleProp<ViewStyle>}
      disabled={disabled || loading}
      {...props}
      onPress={(e) => {
        hapticTap();
        props.onPress?.(e);
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg, fontSize }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  label: {
    fontWeight: FontWeight.semibold,
  },
});
