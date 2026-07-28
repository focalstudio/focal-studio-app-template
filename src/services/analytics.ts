import PostHog from "posthog-react-native";

let client: PostHog | null = null;
let enabled = true;

export function initAnalytics(): void {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  client = new PostHog(key, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  });
  // The store may hydrate the persisted opt-out before the client exists, in
  // which case that setAnalyticsEnabled(false) call had no client to opt out.
  // Re-apply the current preference so init/hydrate ordering doesn't matter.
  if (!enabled) client.optOut();
}

export function setAnalyticsEnabled(value: boolean): void {
  enabled = value;
  if (!value) client?.optOut();
  else client?.optIn();
}

// Union of all valid event names — add app-specific events here.
type AnalyticsEvent =
  | "screen_viewed"
  | "onboarding_completed"
  | "paywall_viewed"
  | "subscription_started"
  | "app_error";

export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (!enabled || !client) return;
  client.capture(event, props as any); // PostHog's JsonType doesn't accept unknown
}

export const Analytics = {
  screenViewed: (screen: string) => track("screen_viewed", { screen }),
  onboardingCompleted: () => track("onboarding_completed"),
  paywallViewed: (source: string) => track("paywall_viewed", { source }),
  subscriptionStarted: (tier: string) => track("subscription_started", { tier }),
  appError: (message: string, source?: string) =>
    track("app_error", { message, source }),
};
