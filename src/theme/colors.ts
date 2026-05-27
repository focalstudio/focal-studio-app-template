export const Colors = {
  light: {
    background: "#FFFFFF",
    surface: "#F2F2F7",
    surfaceElevated: "#FFFFFF",
    text: "#000000",
    textSecondary: "#6C6C70",
    textTertiary: "#AEAEB2",
    border: "rgba(0,0,0,0.12)",
    borderStrong: "rgba(0,0,0,0.22)",
    accent: "[APP_COLOR]",
    accentDark: "[APP_COLOR_DARK]",
    danger: "#FF3B30",
    success: "#34C759",
    warning: "#FF9500",
    info: "#007AFF",
    overlay: "rgba(0,0,0,0.4)",
  },
  dark: {
    background: "#000000",
    surface: "#1C1C1E",
    surfaceElevated: "#2C2C2E",
    text: "#FFFFFF",
    textSecondary: "#AEAEB2",
    textTertiary: "#6C6C70",
    border: "rgba(255,255,255,0.12)",
    borderStrong: "rgba(255,255,255,0.22)",
    accent: "[APP_COLOR]",
    accentDark: "[APP_COLOR_DARK]",
    danger: "#FF453A",
    success: "#32D74B",
    warning: "#FF9F0A",
    info: "#0A84FF",
    overlay: "rgba(0,0,0,0.6)",
  },
} as const;

export type ColorScheme = "light" | "dark";
export type ThemeColors = typeof Colors.light;
