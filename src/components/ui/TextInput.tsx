import React from "react";
import {
  TextInput as RNTextInput,
  Text,
  View,
  StyleSheet,
  type TextInputProps,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { FontSize, FontWeight, Spacing, Radius } from "../../theme";

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

export function TextInput({ label, error, style, ...props }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrapper}>
      {label && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      )}
      <RNTextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            color: colors.text,
            borderColor: error ? colors.danger : colors.border,
          },
          style,
        ]}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
      {error && (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  input: {
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
  },
  error: { fontSize: FontSize.sm },
});
