/**
 * The reference screen test — copy this file to test another screen.
 *
 * See `docs/testing.md` for the full harness description. The two things that
 * are not obvious from reading the code:
 *
 * 1. **This file cannot live next to the screen it tests.** Expo Router turns
 *    every file under `app/` into a route, and its `require.context` filter
 *    (`expo-router/_ctx.ios.js`) excludes only `+api`, `+html`, and
 *    `+middleware` — *not* `__tests__` or `.test.tsx`. A test colocated in
 *    `app/` would ship as a live route in the production bundle. Screen tests
 *    therefore live here and reach up into `app/`.
 *
 * 2. **`renderRouter` turns on fake timers and never turns them off** (see
 *    `expo-router/build/testing-library/index.js`). `jest.setup.after-env.js`
 *    restores real timers after every test so this doesn't leak.
 *
 * `renderRouter` is used rather than RTL's bare `render` because these screens
 * call router hooks — `useFocusEffect` here, `useRouter`/`useLocalSearchParams`
 * elsewhere. It mounts the real router around the real screen module, so the
 * hooks work instead of needing a stub per hook.
 */

import { renderRouter, screen } from "expo-router/testing-library";

import { APP_NAME } from "../../constants";
import { Analytics } from "../../services/analytics";
import HomeScreen from "../../../app/(tabs)/index";

/**
 * Analytics is mocked so the assertion below is about the screen, not about
 * PostHog's opt-out state. Same convention as `useAppStore.test.ts`.
 */
jest.mock("../../services/analytics", () => ({
  Analytics: {
    screenViewed: jest.fn(),
    onboardingCompleted: jest.fn(),
    paywallViewed: jest.fn(),
    subscriptionStarted: jest.fn(),
    appError: jest.fn(),
  },
  initAnalytics: jest.fn(),
  setAnalyticsEnabled: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("HomeScreen", () => {
  it("renders at / with its content", async () => {
    renderRouter({ index: HomeScreen }, { initialUrl: "/" });

    expect(screen).toHavePathname("/");
    expect(await screen.findByText(APP_NAME)).toBeOnTheScreen();
    expect(screen.getByText("Welcome")).toBeOnTheScreen();
  });

  /**
   * Proves the router context is real rather than stubbed: `useFocusEffect`
   * only fires when a genuine navigation container reports the screen focused.
   */
  it("tracks a screen view once focused", async () => {
    renderRouter({ index: HomeScreen }, { initialUrl: "/" });

    await screen.findByText(APP_NAME);
    expect(Analytics.screenViewed).toHaveBeenCalledWith("home");
  });
});
