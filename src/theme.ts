/**
 * Design token source of truth.
 *
 * CSS custom properties in App.css must stay in sync with the palette below.
 * Update [APP_COLOR] and [APP_COLOR_DARK] after placeholder replacement.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const palette = {
  light: {
    bgPage: "#fafafa",
    bgCard: "#ffffff",
    bgHover: "rgba(0, 0, 0, 0.04)",
  },
  dark: {
    bgPage: "#000000",
    bgCard: "#111111",
    bgHover: "rgba(255, 255, 255, 0.06)",
  },
  textLight: {
    primary: "#111111",
    secondary: "#5a5a5a",
    muted: "#9a9a9a",
  },
  textDark: {
    primary: "#f5f5f5",
    secondary: "#888888",
    muted: "#555555",
  },
  // Brand accent — replace [APP_COLOR] / [APP_COLOR_DARK] after template setup
  brand: {
    light: "[APP_COLOR]",
    dark: "[APP_COLOR_DARK]",
    bg: "rgba(0,0,0,0.06)",
  },
  red: {
    50: "#fdecea",
    500: "#d32f2f",
  },
  blue: {
    50: "#e8f0fe",
    500: "#1976d2",
  },
  orange: {
    50: "#fef4e8",
    500: "#e67e22",
  },
} as const;

// ---------------------------------------------------------------------------
// Borders / Shadows / Radii / Spacing / Typography
// ---------------------------------------------------------------------------

export const borders = {
  light: { light: "rgba(0, 0, 0, 0.07)", medium: "rgba(0, 0, 0, 0.13)" },
  dark:  { light: "rgba(255, 255, 255, 0.08)", medium: "rgba(255, 255, 255, 0.15)" },
} as const;

export const shadows = {
  light: {
    card:     "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
    cardHover:"0 2px 8px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.06)",
    elevated: "0 4px 16px rgba(0,0,0,0.12), 0 12px 32px rgba(0,0,0,0.08)",
  },
  dark: {
    card:     "0 1px 3px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.35)",
    cardHover:"0 2px 8px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4)",
    elevated: "0 4px 16px rgba(0,0,0,0.7), 0 12px 32px rgba(0,0,0,0.5)",
  },
} as const;

export const radii = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
} as const;

export const spacing = {
  1: "4px", 2: "8px", 3: "12px",
  4: "16px", 5: "20px", 6: "24px",
} as const;

export const typography = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, Roboto, Arial, sans-serif",
  size: {
    xs: "11px", sm: "13px", base: "15px",
    md: "16px", lg: "18px", xl: "20px", "2xl": "24px",
  },
  weight: {
    regular: 400, medium: 500, semibold: 600, bold: 700, black: 900,
  },
} as const;
