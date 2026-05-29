import React from "react";
import { StyleSheet, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../hooks/useTheme";

type Props = ViewProps & {
  children: React.ReactNode;
  edges?: ("top" | "bottom" | "left" | "right")[];
};

export function Screen({ children, style, edges = ["top", "bottom"], ...props }: Props) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, { backgroundColor: colors.background }, style]}
      {...props}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
