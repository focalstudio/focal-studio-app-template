import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../hooks/useTheme";
import { FontSize, FontWeight, Spacing, Radius } from "../../theme";
import { hapticTap } from "../../services/haptics";

/**
 * Branded sign-in buttons for Apple and Google.
 *
 * These are not styled with the app's design tokens, and that is deliberate.
 * Both providers publish binding appearance rules — Apple's Human Interface
 * Guidelines and Google's Identity branding guidelines — covering the exact
 * colours, the approved wording, the minimum height, and the requirement that
 * the logomark is never redrawn or recoloured. An App Store reviewer checks
 * this. Only the corner radius follows the app's own `Radius.md` so the buttons
 * still sit consistently with the rest of the form.
 *
 * The marks are drawn with `react-native-svg`, already a direct dependency —
 * no icon package and, more importantly, no provider SDK is imported here. This
 * component is purely presentational so `app/(auth)/login.tsx` stays free of
 * any dependency that `scripts/add-social-auth.sh` may or may not have added.
 */

type Provider = "apple" | "google";

type Props = Omit<PressableProps, "children"> & {
  provider: Provider;
  loading?: boolean;
};

/** Apple's approved wording. Do not substitute a custom label. */
const LABEL: Record<Provider, string> = {
  apple: "Continue with Apple",
  google: "Continue with Google",
};

export function SocialSignInButton({
  provider,
  loading = false,
  disabled,
  style,
  ...props
}: Props) {
  const { isDark } = useTheme();

  // Apple: black on a light UI, white on a dark one. Google's palette is fixed
  // by its brand guidelines and does not vary with the app's accent colour.
  const theme =
    provider === "apple"
      ? isDark
        ? { bg: "#FFFFFF", fg: "#000000", border: "transparent" }
        : { bg: "#000000", fg: "#FFFFFF", border: "transparent" }
      : isDark
        ? { bg: "#131314", fg: "#E3E3E3", border: "#8E918F" }
        : { bg: "#FFFFFF", fg: "#1F1F1F", border: "#747775" };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={LABEL[provider]}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={
        [
          styles.base,
          {
            backgroundColor: theme.bg,
            borderColor: theme.border,
            borderRadius: Radius.md,
            opacity: disabled ? 0.6 : 1,
          },
        ] as StyleProp<ViewStyle>
      }
      disabled={disabled || loading}
      {...props}
      onPress={(e) => {
        hapticTap();
        props.onPress?.(e);
      }}
    >
      {({ pressed }) => (
        <View style={[styles.content, { opacity: pressed ? 0.7 : 1 }]}>
          {loading ? (
            <ActivityIndicator color={theme.fg} />
          ) : (
            <>
              {provider === "apple" ? <AppleMark color={theme.fg} /> : <GoogleMark />}
              <Text style={[styles.label, { color: theme.fg }]}>{LABEL[provider]}</Text>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

/** Apple logomark. Monochrome by rule — it takes the button's foreground colour. */
function AppleMark({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}

/** Google "G". Its four brand colours are fixed and must not be themed. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // 50pt clears Apple's 44pt minimum and matches the `lg` Button height family.
  base: {
    height: 50,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
});
