import posthog from "posthog-js";

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const ENABLED = Boolean(KEY);

export function initAnalytics() {
  if (!ENABLED) return;
  posthog.init(KEY!, {
    api_host: "https://eu.i.posthog.com",
    ui_host: "https://eu.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage",
    ip: false,
  });
}

export function setAnalyticsEnabled(enabled: boolean) {
  if (!ENABLED) return;
  if (enabled) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}

export function isAnalyticsEnabled(): boolean {
  if (!ENABLED) return false;
  return !posthog.has_opted_out_capturing();
}

export function trackTabViewed(tab: string) {
  if (!ENABLED) return;
  posthog.capture("tab_viewed", { tab });
}

export function trackTabLeft(tab: string, dwell_seconds: number) {
  if (!ENABLED) return;
  posthog.capture("tab_left", { tab, dwell_seconds });
}

export function trackAppError(message: string, source?: string) {
  if (!ENABLED) return;
  posthog.capture("app_error", { message: message.slice(0, 300), source });
}

// ── App-specific event helpers — add typed wrappers below this line ────────
// Pattern: one function per event, typed props, guard with `if (!ENABLED) return`
//
// Example:
//   export function trackCoreActionStarted(p: { duration_seconds: number }) {
//     if (!ENABLED) return;
//     posthog.capture("core_action_started", p);
//   }
//
//   export function trackCoreActionCompleted(p: { duration_seconds: number; outcome: string }) {
//     if (!ENABLED) return;
//     posthog.capture("core_action_completed", p);
//   }
//
//   export function trackFeatureViewed(featureName: string) {
//     if (!ENABLED) return;
//     posthog.capture("feature_viewed", { feature: featureName });
//   }
