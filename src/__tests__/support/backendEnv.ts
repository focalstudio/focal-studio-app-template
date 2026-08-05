/**
 * Shared environment fixtures for tests that re-require `env.js`.
 *
 * `env.js` validates on require and promotes the selected backend's variables
 * from optional to required, so any test that builds a `process.env` from
 * scratch fails the moment someone runs `scripts/add-backend.sh` — the schema
 * correctly rejects an environment missing that backend's config.
 *
 * These fixtures let a test stay meaningful in the template (`BACKEND = "none"`)
 * and in a generated app alike.
 *
 * This file lives under `__tests__/support/`, excluded from `testMatch` by
 * `testPathIgnorePatterns` in `jest.config.js` — Jest would otherwise treat it
 * as a suite and fail it for containing no tests.
 *
 * Kept in one place because a duplicated copy is exactly what caused #100:
 * `env-schema.test.ts` was made backend-agnostic, then `app-config.test.ts` was
 * written later against the template's default and broke on both backends.
 */

/** The minimum valid configuration for each backend `env.js` accepts. */
export const BACKEND_VARS = {
  none: {},
  supabase: {
    EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xyz",
  },
  firebase: {
    EXPO_PUBLIC_FIREBASE_API_KEY: "AIzaPlaceholder",
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "abc.firebaseapp.com",
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: "abc",
    EXPO_PUBLIC_FIREBASE_APP_ID: "1:2:web:3",
  },
} as const;

export type BackendName = keyof typeof BACKEND_VARS;

/**
 * The minimum valid configuration for each paywall provider.
 *
 * Orthogonal to the backend, exactly as `PAYWALL` is to `BACKEND` in `env.js` —
 * an app can have either, both, or neither.
 *
 * The `appl_` prefix is not decorative: `env.js` regex-checks it so that
 * swapping the Apple and Google keys fails at build time rather than at runtime
 * as an opaque "invalid credentials".
 */
export const PAYWALL_VARS = {
  none: {},
  revenuecat: {
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_placeholder",
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_placeholder",
  },
} as const;

export type PaywallName = keyof typeof PAYWALL_VARS;

/**
 * A value for every backend's and every paywall provider's variables at once.
 *
 * `env.js` only *requires* the ones belonging to the backend and paywall it has
 * selected, so this is a valid environment whatever `BACKEND` and `PAYWALL`
 * happen to be. Use it as the base whenever a test cares about something other
 * than provider selection.
 *
 * The paywall entries matter for the same reason the backend ones do: once
 * `scripts/add-paywall.sh` runs, the adapter calls `requireEnv(...)` at module
 * load, so every suite whose import graph reaches
 * `src/services/paywall/index.ts` would fail to start without them (#100).
 */
// Typed as a plain string record, not `as const`: callers spread it into a
// `NodeJS.ProcessEnv` cast, which TypeScript rejects against a readonly object
// of string *literal* types.
export const EVERY_BACKEND_CONFIGURED: Record<string, string> = {
  ...BACKEND_VARS.supabase,
  ...BACKEND_VARS.firebase,
  ...PAYWALL_VARS.revenuecat,
};
