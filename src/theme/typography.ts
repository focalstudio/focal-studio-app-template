import { Platform } from "react-native";

export const FontFamily = {
  regular: Platform.select({ ios: "System", android: "Roboto", default: "System" }),
  medium: Platform.select({ ios: "System", android: "Roboto-Medium", default: "System" }),
  semibold: Platform.select({ ios: "System", android: "Roboto-Medium", default: "System" }),
  bold: Platform.select({ ios: "System", android: "Roboto-Bold", default: "System" }),
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  display: 34,
} as const;

export const FontWeight = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  heavy: "800" as const,
};

export const LineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;
