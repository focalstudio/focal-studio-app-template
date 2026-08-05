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
import { EVERY_BACKEND_CONFIGURED } from "./src/__tests__/support/backendEnv";

/**
 * Placeholder backend configuration, so `src/env.ts` resolves under Node.
 *
 * `readEnv()` falls back to `process.env` when there is no Expo manifest, which
 * is always the case in Jest. Once a backend is wired, its adapter calls
 * `requireEnv(...)` at *module load* — so with nothing set, every suite whose
 * import graph reaches `src/services/auth/index.ts` fails to even start with
 * "EXPO_PUBLIC_FIREBASE_API_KEY is not set" (#100). It is the same five suites
 * the ESM problem hits, which is why this only surfaced once that was fixed.
 *
 * Assigned rather than overwritten, so a real `.env.local` value (or anything
 * CI exports) still wins. These are structurally valid but meaningless — no test
 * should ever reach a network call with them: the shipped adapters are faked at
 * the `AuthProvider` port everywhere except their own contract tests, which mock
 * the SDK itself because the mapping is what they exist to check. Both levels,
 * and when each applies, are in `docs/testing.md`.
 */
for (const [key, value] of Object.entries(EVERY_BACKEND_CONFIGURED)) {
  process.env[key] ??= value;
}

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

/**
 * The Supabase session store.
 *
 * `templates/backends/supabase/supabase.ts` imports
 * `expo-sqlite/localStorage/install` for its side effect: it defines a
 * `localStorage` global, which is what supabase-js is handed as its storage
 * adapter. That side effect runs at import time and immediately touches the
 * native SQLite binding, so without this mock every suite whose import graph
 * reaches `src/services/auth/index.ts` dies with
 * `_ExpoSQLite.default.NativeDatabase is not a constructor` as soon as the
 * Supabase backend is wired (#100).
 *
 * `virtual: true` is required: `expo-sqlite` is not a dependency of the
 * template as shipped — `scripts/add-backend.sh supabase` installs it — and a
 * non-virtual mock of a module that cannot be resolved fails outright. Virtual
 * makes this a no-op in the un-wired template and a real mock once it isn't.
 *
 * The replacement is a plain in-memory Storage. Persistence across a real app
 * restart is not something a mock can prove anyway — that is what
 * `.maestro/persistence.yaml` is for.
 */
jest.mock(
  "expo-sqlite/localStorage/install",
  () => {
    const entries = new Map();
    globalThis.localStorage = {
      getItem: (key) => (entries.has(String(key)) ? entries.get(String(key)) : null),
      setItem: (key, value) => void entries.set(String(key), String(value)),
      removeItem: (key) => void entries.delete(String(key)),
      clear: () => entries.clear(),
      key: (index) => Array.from(entries.keys())[index] ?? null,
      get length() {
        return entries.size;
      },
    };
    return {};
  },
  { virtual: true }
);

/**
 * The RevenueCat SDK.
 *
 * `templates/paywall/revenuecat.ts` calls `Purchases.configure()` at module
 * scope, and the SDK touches `NativeModules` as soon as it is imported — so
 * without this, every suite whose import graph reaches
 * `src/services/paywall/index.ts` dies the moment `add-paywall.sh` has run.
 * Same failure shape as #100, fixed here before it can bite.
 *
 * `virtual: true` for the same reason as the `expo-sqlite` mock above:
 * `react-native-purchases` is not a dependency of the template as shipped —
 * `scripts/add-paywall.sh` installs it — and a non-virtual mock of an
 * unresolvable module fails outright. Virtual makes this inert in the un-wired
 * template and a real mock once it isn't.
 *
 * A virtual mock keeps applying after the package is installed: Jest keys
 * `_virtualMocks` by the bare specifier and short-circuits module resolution
 * before it ever reaches the real file. So no ordinary suite loads the real
 * package.
 *
 * `templates/paywall/revenuecat.test.ts` declares its own richer, non-virtual
 * `jest.mock` of the same specifier. That resolves to the same module ID and
 * simply overwrites this factory, so the contract test wins with no ordering
 * hazard — and it is also the one suite that calls `requireActual` to read the
 * real `PURCHASES_ERROR_CODE`, which is why `react-native-purchases` and
 * `@revenuecat` still have to appear in `ESM_PACKAGES` in `jest.config.js`.
 */
jest.mock(
  "react-native-purchases",
  () => ({
    __esModule: true,
    default: {
      configure: jest.fn(),
      getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
      getOfferings: jest.fn().mockResolvedValue({ current: null }),
      purchasePackage: jest.fn(),
      restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
      addCustomerInfoUpdateListener: jest.fn(() => jest.fn()),
      removeCustomerInfoUpdateListener: jest.fn(),
      logIn: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
      logOut: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
      setLogLevel: jest.fn(),
    },
    LOG_LEVEL: { DEBUG: "DEBUG", INFO: "INFO", WARN: "WARN", ERROR: "ERROR" },
    PACKAGE_TYPE: { MONTHLY: "MONTHLY", ANNUAL: "ANNUAL", LIFETIME: "LIFETIME" },
    // The adapter reads this at module scope, so it has to exist here even
    // though only `revenuecat.test.ts` (which replaces this factory with one
    // spreading `requireActual`) asserts against the real values.
    PURCHASES_ERROR_CODE: { LOG_OUT_ANONYMOUS_USER_ERROR: "22" },
  }),
  { virtual: true }
);

/**
 * `app/_layout.tsx` renders `<StatusBar>` unconditionally. Left unmocked, it
 * is harmless on its own (a screen test that never mounts a tab navigator —
 * e.g. the reference `home-screen.test.tsx`, which renders `(tabs)/index`
 * directly via the single-screen shortcut without going through the real
 * root layout — never trips this). But mounting the *real* root layout with
 * a `Stack.Protected`-guarded `Tabs` navigator active (as any test of the
 * auth/onboarding routing guards must) causes the real component to loop:
 * each render re-registers with the native status bar module, and something
 * in that interaction re-triggers a render on every commit, forever — a
 * synchronous loop that starves the event loop badly enough that Jest's own
 * `testTimeout` (itself a `setTimeout`) never gets a chance to fire. The
 * mock avoids the native registration entirely.
 */
jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));
