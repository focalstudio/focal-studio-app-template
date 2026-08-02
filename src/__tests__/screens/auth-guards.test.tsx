/**
 * Covers the `Stack.Protected` guards in `app/_layout.tsx` (issue #65) — the
 * router-level gate that decides which route group (`onboarding`, `(auth)`,
 * `(tabs)`) is reachable given onboarding + auth state.
 *
 * This is a *routing* test, not a single-screen test, so it registers the
 * real paths with `renderRouter` and asserts with `toHavePathname` /
 * `toHaveSegments` per `docs/testing.md`'s guidance, instead of the
 * `{ index: Component }` single-screen shortcut used elsewhere.
 *
 * `RootLayout`'s mount effect calls `hydrate()` on all four stores, which
 * overwrites any state seeded with `setState` before render. So each test
 * controls hydration's *inputs* instead:
 *  - auth: `mockProvider.getSession()` resolves a session, `null`, or hangs
 *    forever (to simulate hydration still in flight).
 *  - onboarding: the AsyncStorage key `useOnboardingStore.hydrate()` reads.
 *
 * The auth-provider mock follows the convention in
 * `src/store/__tests__/useAuthStore.test.ts` verbatim: a stable `mockProvider`
 * object (the store captures `authProvider` once at module load), wiped in
 * place by `resetProvider()`, with the real `types` + `authErrorMessage`
 * spread into the mocked barrel.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderRouter, screen } from "expo-router/testing-library";

import { APP_NAME, STORAGE_PREFIX } from "../../constants";
import type { AuthProvider, AuthSession } from "../../services/auth/types";

// Mounting the real root layout with `(tabs)` active pulls in a full Tabs
// navigator on top of the Stack reconciliation `renderRouter`'s fake timers
// already have to drive. That's fast in isolation, but under `npm test`'s
// parallel workers it occasionally needs more than Jest's 5s default —
// observed as an intermittent timeout with no other symptom. A generous
// per-file timeout trades a slower failure for a real one: a genuinely
// broken guard still times out, just after longer.
jest.setTimeout(15000);

const ONBOARDING_KEY = `${STORAGE_PREFIX}onboarding_complete`;

const session: AuthSession = {
  accessToken: "token",
  refreshToken: "refresh",
  expiresAt: null,
  user: { id: "1", email: "a@b.c", name: "Ada" },
};

/** See useAuthStore.test.ts — identity must stay stable across tests. */
const mockProvider = {} as AuthProvider & Record<string, unknown>;

function baseProvider(): AuthProvider {
  return {
    name: "mock",
    getSession: jest.fn().mockResolvedValue(null),
    signIn: jest.fn().mockResolvedValue(session),
    signUp: jest.fn().mockResolvedValue(session),
    signOut: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  };
}

function resetProvider() {
  for (const key of Object.keys(mockProvider)) delete mockProvider[key];
  Object.assign(mockProvider, baseProvider());
}

jest.mock("../../services/auth", () => ({
  ...jest.requireActual("../../services/auth/types"),
  authErrorMessage: jest.requireActual("../../services/auth/messages").authErrorMessage,
  authProvider: mockProvider,
}));

/**
 * `app/_layout.tsx` calls `initAnalytics()` on mount. Same convention as the
 * reference screen test — this test is about routing, not analytics.
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

// Imported after the mocks above are registered.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require("../../store/useAuthStore") as typeof import("../../store/useAuthStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useOnboardingStore } = require("../../store/useOnboardingStore") as typeof import("../../store/useOnboardingStore");

const authInitialState = useAuthStore.getState();
const onboardingInitialState = useOnboardingStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useAuthStore.setState(authInitialState, true);
  useOnboardingStore.setState(onboardingInitialState, true);
  resetProvider();
  jest.clearAllMocks();
});

/**
 * The route map every case in this file needs. `_layout.tsx` declares
 * `<Stack.Screen name="paywall">` and `(tabs)/_layout.tsx` declares a
 * "settings" tab unconditionally (outside any guard) — omitting either from
 * the mock context leaves React Navigation unable to resolve a screen it
 * expects on every render, which manifested as a `[Layout children]: No
 * route named "paywall" exists` warning repeating forever rather than a
 * clean single warning, i.e. a render loop, not just console noise.
 */
const routes = {
  _layout: require("../../../app/_layout").default,
  index: require("../../../app/index").default,
  onboarding: require("../../../app/onboarding").default,
  "(auth)/_layout": require("../../../app/(auth)/_layout").default,
  "(auth)/login": require("../../../app/(auth)/login").default,
  "(tabs)/_layout": require("../../../app/(tabs)/_layout").default,
  "(tabs)/index": require("../../../app/(tabs)/index").default,
  "(tabs)/settings": require("../../../app/(tabs)/settings").default,
  paywall: require("../../../app/paywall").default,
};

describe("Stack.Protected auth guards", () => {
  it("signed out + onboarding complete lands in (auth), not (tabs)", async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    mockProvider.getSession = jest.fn().mockResolvedValue(null);

    renderRouter(routes, { initialUrl: "/" });

    // "/" is also the pathname before hydration settles, so waiting on
    // pathname alone would pass instantly and prove nothing. The login
    // screen's "Sign In" button only renders once the (auth) guard is
    // actually true, so waiting on it is what proves the redirect happened.
    await screen.findByText("Sign In");
    expect(screen).toHavePathname("/login");
    expect(screen).toHaveSegments(["(auth)", "login"]);
  });

  it("signed in + onboarding complete lands in (tabs), not (auth)", async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    mockProvider.getSession = jest.fn().mockResolvedValue(session);

    renderRouter(routes, { initialUrl: "/" });

    await screen.findByText("Welcome");
    expect(screen).toHavePathname("/");
    // Not ["(tabs)", "index"]: expo-router omits a segment named "index"
    // when it's the group's default route, unlike "(auth)/login" below.
    expect(screen).toHaveSegments(["(tabs)"]);
  });

  it("onboarding incomplete wins over a signed-out user", async () => {
    mockProvider.getSession = jest.fn().mockResolvedValue(null);

    renderRouter(routes, { initialUrl: "/" });

    await screen.findByText(`Welcome to ${APP_NAME}`);
    expect(screen).toHavePathname("/onboarding");
  });

  it("onboarding incomplete wins even when the user is signed in", async () => {
    mockProvider.getSession = jest.fn().mockResolvedValue(session);

    renderRouter(routes, { initialUrl: "/" });

    await screen.findByText(`Welcome to ${APP_NAME}`);
    expect(screen).toHavePathname("/onboarding");
  });

  it("neither (auth) nor (tabs) is reachable while hydration is in flight", async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    // Never resolves — authLoading stays true, so `booted` never flips.
    mockProvider.getSession = jest.fn().mockReturnValue(new Promise(() => {}));

    renderRouter(routes, { initialUrl: "/" });

    // `app/index.tsx` renders only an ActivityIndicator while loading, and no
    // `Stack.Protected` guard is true yet, so the router never leaves `/`.
    expect(screen).toHavePathname("/");
    expect(screen.queryByText("Sign In")).toBeNull();
    expect(screen.queryByText("Welcome")).toBeNull();
  });

  // Regression for #58: a manual `router.replace` left the previous (tabs)
  // screen reachable by back-swipe when auth flipped mid-session.
  // `Stack.Protected` unmounts the guarded screens outright instead of just
  // navigating away from them, which is what this test is really pinning down.
  it("losing auth mid-session leaves (tabs) unreachable, not just navigated away from", async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    mockProvider.getSession = jest.fn().mockResolvedValue(session);

    const result = renderRouter(routes, { initialUrl: "/" });

    await screen.findByText("Welcome");
    expect(screen).toHaveSegments(["(tabs)"]);

    act(() => {
      useAuthStore.setState({ session: null, user: null, isAuthenticated: false });
    });

    await screen.findByText("Sign In");
    expect(screen).toHavePathname("/login");
    expect(screen).toHaveSegments(["(auth)", "login"]);

    // `Stack.Protected` removes the (tabs) screens from the navigator's state
    // entirely rather than merely pushing over them, so there is no history
    // entry left to swipe back into. `getRouterState()` — available on the
    // object `renderRouter` returns, not on `screen` itself — is the closest
    // public surface to asserting that directly: confirm no route in the
    // current navigation state still points at the (tabs) group.
    const stateString = JSON.stringify(result.getRouterState());
    expect(stateString).not.toContain("(tabs)");
  });
});
