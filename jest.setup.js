/* global jest */

/**
 * Module mocks, applied before the test framework is installed.
 *
 * Everything here is a *native* dependency that cannot load under Node. Pure-JS
 * modules are deliberately left real — see `docs/testing.md` for why this list
 * is kept short, and for what `jest-expo`'s preset already handles for us (the
 * `@/` alias, `transformIgnorePatterns`, and the Expo NativeModules stubs).
 *
 * Per-test lifecycle lives in `jest.setup.after-env.js`, not here.
 */

import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);

/**
 * `src/components/layout/Screen.tsx` wraps every screen in `SafeAreaView`, so
 * without this no screen renders at all.
 *
 * The library ships its own mock, which spreads `requireActual` — the contexts
 * and `SafeAreaView` stay real, and only the metrics become deterministic
 * (a 320x640 frame with zero insets). Hand-rolling this would drop
 * `SafeAreaInsetsContext`, which the real provider reads from.
 */
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);

/**
 * Reached transitively from `src/services/haptics.ts` by `Button`, `Toggle`,
 * and `SocialSignInButton` — i.e. by most screens. The real module needs the
 * native `ExpoHaptics` module.
 */
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

/**
 * `useTheme()` reads `useAppStore`, which imports both of these at module load
 * — so *every* screen pulls them in, whether or not it touches notifications
 * or analytics.
 *
 * `expo-notifications` does load unmocked (jest-expo stubs the native module),
 * but registering its push-token listener prints a multi-line Expo Go warning
 * on every single screen test. `posthog-react-native` is mocked to keep the
 * SDK's timers and network client out of the test process entirely — a screen
 * test should never depend on `EXPO_PUBLIC_POSTHOG_KEY` being unset.
 */
jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("id"),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
}));

jest.mock("posthog-react-native", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    capture: jest.fn(),
    optIn: jest.fn(),
    optOut: jest.fn(),
  })),
}));

/**
 * `src/services/ratingService.ts`, reached from the settings screen.
 * `isAvailableAsync` resolves false by default so no test accidentally trips
 * the real review-prompt path.
 */
jest.mock("expo-store-review", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  requestReview: jest.fn().mockResolvedValue(undefined),
}));
