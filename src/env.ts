import Constants from "expo-constants";

/**
 * Typed, validated environment access.
 *
 * Values come from the Expo manifest (`extra.env`), which `app.config.js`
 * populates from `env.js` after validation — so anything readable here has
 * already passed the schema at build time.
 *
 * Prefer this over `process.env.EXPO_PUBLIC_*` in app code: reading straight
 * from `process.env` bypasses validation and silently yields `undefined` for a
 * typo, which is the failure mode the schema exists to prevent.
 */
export type AppEnv = {
  EXPO_PUBLIC_POSTHOG_KEY?: string;
  EXPO_PUBLIC_POSTHOG_HOST?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_FIREBASE_API_KEY?: string;
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  EXPO_PUBLIC_FIREBASE_PROJECT_ID?: string;
  EXPO_PUBLIC_FIREBASE_APP_ID?: string;
};

export type Backend = "none" | "supabase" | "firebase";

/**
 * Jest and any other non-Expo runtime have no manifest, so fall back to
 * `process.env`. Babel inlines `EXPO_PUBLIC_*` in app builds, so this fallback
 * also keeps things working if the manifest is ever unavailable at runtime.
 */
function readEnv(): AppEnv {
  const fromManifest = Constants.expoConfig?.extra?.env as AppEnv | undefined;
  if (fromManifest) return fromManifest;

  return {
    EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
}

export const env: AppEnv = readEnv();

/** Which backend `scripts/add-backend.sh` wired in, if any. */
export const backend: Backend =
  (Constants.expoConfig?.extra?.backend as Backend | undefined) ?? "none";

/**
 * Reads a variable that the schema guarantees is present for the active
 * backend. Throws rather than returning undefined, so an adapter never
 * constructs a client against a half-configured environment.
 */
export function requireEnv(key: keyof AppEnv): string {
  const value = env[key];
  if (!value) {
    throw new Error(
      `${key} is not set. Add it to .env.local and restart the bundler — ` +
        `env.js validates it at build time, so a running app should never reach this.`
    );
  }
  return value;
}
