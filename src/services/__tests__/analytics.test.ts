import PostHog from "posthog-react-native";

/**
 * `analytics.ts` holds `client` and `enabled` as module-level state, and reads
 * `env.EXPO_PUBLIC_POSTHOG_KEY` inside `initAnalytics()`. Both mean a test has
 * to load the module fresh with the environment it wants, so every case goes
 * through this helper rather than a top-level import.
 *
 * Per `docs/testing.md`, `../env` is spread rather than replaced — a factory
 * returning a bare object drops `requireEnv`, which a wired adapter calls at
 * module load.
 */
function loadAnalytics(envOverrides: Record<string, string | undefined> = {}) {
  let mod!: typeof import("../analytics");

  jest.isolateModules(() => {
    jest.doMock("../../env", () => {
      const actual = jest.requireActual("../../env");
      return { ...actual, env: { ...actual.env, ...envOverrides } };
    });
    // Required, not imported: the whole point is to re-evaluate the module
    // after `doMock`, which a hoisted `import` would defeat.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../analytics");
  });

  return mod;
}

/** The instance the module got back from `new PostHog(...)`. */
function lastClient() {
  const mockPostHog = jest.mocked(PostHog);
  const result = mockPostHog.mock.results.at(-1);
  if (result === undefined) throw new Error("PostHog was never constructed");
  return result.value as {
    capture: jest.Mock;
    optIn: jest.Mock;
    optOut: jest.Mock;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("initAnalytics", () => {
  it("constructs a client with the configured key", () => {
    const { initAnalytics } = loadAnalytics({ EXPO_PUBLIC_POSTHOG_KEY: "phc_test" });

    initAnalytics();

    expect(PostHog).toHaveBeenCalledWith("phc_test", expect.anything());
  });

  it("defaults to the EU host when none is configured", () => {
    const { initAnalytics } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
      EXPO_PUBLIC_POSTHOG_HOST: undefined,
    });

    initAnalytics();

    expect(PostHog).toHaveBeenCalledWith("phc_test", {
      host: "https://eu.i.posthog.com",
    });
  });

  it("honours a configured host", () => {
    const { initAnalytics } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
      EXPO_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    });

    initAnalytics();

    expect(PostHog).toHaveBeenCalledWith("phc_test", {
      host: "https://us.i.posthog.com",
    });
  });

  // Analytics is optional by design — env.js keeps the key optional so an app
  // can ship with PostHog disabled entirely.
  it("constructs nothing when no key is configured", () => {
    const { initAnalytics } = loadAnalytics({ EXPO_PUBLIC_POSTHOG_KEY: undefined });

    expect(() => initAnalytics()).not.toThrow();
    expect(PostHog).not.toHaveBeenCalled();
  });
});

/**
 * The ordering bug this guards: `useAppStore` can hydrate a persisted opt-out
 * before `initAnalytics()` has run, so that `setAnalyticsEnabled(false)` has no
 * client to opt out. `initAnalytics()` re-applies the current preference for
 * exactly that reason.
 */
describe("opt-out survives init/hydrate ordering", () => {
  it("re-applies an opt-out that was set before the client existed", () => {
    const { initAnalytics, setAnalyticsEnabled } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
    });

    setAnalyticsEnabled(false); // no client yet — nothing to call
    initAnalytics();

    expect(lastClient().optOut).toHaveBeenCalledTimes(1);
  });

  it("does not opt out a client when the user never opted out", () => {
    const { initAnalytics } = loadAnalytics({ EXPO_PUBLIC_POSTHOG_KEY: "phc_test" });

    initAnalytics();

    expect(lastClient().optOut).not.toHaveBeenCalled();
  });

  it("opts out immediately when the client already exists", () => {
    const { initAnalytics, setAnalyticsEnabled } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
    });

    initAnalytics();
    setAnalyticsEnabled(false);

    expect(lastClient().optOut).toHaveBeenCalledTimes(1);
  });

  it("opts back in when re-enabled", () => {
    const { initAnalytics, setAnalyticsEnabled } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
    });

    initAnalytics();
    setAnalyticsEnabled(false);
    setAnalyticsEnabled(true);

    expect(lastClient().optIn).toHaveBeenCalledTimes(1);
  });

  it("does not throw when toggled with no client at all", () => {
    const { setAnalyticsEnabled } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: undefined,
    });

    expect(() => setAnalyticsEnabled(false)).not.toThrow();
    expect(() => setAnalyticsEnabled(true)).not.toThrow();
  });
});

describe("track", () => {
  it("captures the event and its properties", () => {
    const { initAnalytics, track } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
    });

    initAnalytics();
    track("paywall_viewed", { source: "settings" });

    expect(lastClient().capture).toHaveBeenCalledWith("paywall_viewed", {
      source: "settings",
    });
  });

  // A no-key build must be inert, not broken: every `Analytics.*` call site
  // fires unconditionally from screens.
  it("is a silent no-op with no client", () => {
    const { track } = loadAnalytics({ EXPO_PUBLIC_POSTHOG_KEY: undefined });

    expect(() => track("app_error", { message: "x" })).not.toThrow();
  });

  it("captures nothing while opted out", () => {
    const { initAnalytics, setAnalyticsEnabled, track } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
    });

    initAnalytics();
    setAnalyticsEnabled(false);
    track("screen_viewed", { screen: "home" });

    expect(lastClient().capture).not.toHaveBeenCalled();
  });

  it("resumes capturing after opting back in", () => {
    const { initAnalytics, setAnalyticsEnabled, track } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
    });

    initAnalytics();
    setAnalyticsEnabled(false);
    setAnalyticsEnabled(true);
    track("screen_viewed", { screen: "home" });

    expect(lastClient().capture).toHaveBeenCalledTimes(1);
  });
});

describe("Analytics helpers map onto the event union", () => {
  it("passes the documented event name and shape for each helper", () => {
    const { initAnalytics, Analytics } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
    });

    initAnalytics();

    Analytics.screenViewed("home");
    Analytics.onboardingCompleted();
    Analytics.paywallViewed("settings");
    Analytics.subscriptionStarted("annual");
    Analytics.appError("boom", "hydrate");

    expect(lastClient().capture.mock.calls).toEqual([
      ["screen_viewed", { screen: "home" }],
      ["onboarding_completed", undefined],
      ["paywall_viewed", { source: "settings" }],
      ["subscription_started", { tier: "annual" }],
      ["app_error", { message: "boom", source: "hydrate" }],
    ]);
  });

  it("leaves an omitted optional source undefined rather than dropping the event", () => {
    const { initAnalytics, Analytics } = loadAnalytics({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
    });

    initAnalytics();
    Analytics.appError("boom");

    expect(lastClient().capture).toHaveBeenCalledWith("app_error", {
      message: "boom",
      source: undefined,
    });
  });
});
