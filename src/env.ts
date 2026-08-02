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
  EXPO_PUBLIC_DEV_BYPASS_EMAIL?: string;
  EXPO_PUBLIC_DEV_BYPASS_PASSWORD?: string;
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
    // EXPO_PUBLIC_DEV_BYPASS_* is deliberately absent, and must stay absent.
    // Babel inlines every `process.env.EXPO_PUBLIC_*` expression it sees into
    // the bundle at build time, so listing the bypass password here would bake
    // it in even for a store build — exactly what `stripDevBypass()` in
    // app.config.js exists to prevent. Those two are manifest-only reads.
  };
}

export const env: AppEnv = readEnv();

/** Which backend `scripts/add-backend.sh` wired in, if any. */
export const backend: Backend =
  (Constants.expoConfig?.extra?.backend as Backend | undefined) ?? "none";

/**
 * The branch this build was cut from, baked into the manifest by
 * `resolveGitBranch()` in app.config.js. Null when it could not be determined.
 */
export const gitBranch: string | null =
  (Constants.expoConfig?.extra?.gitBranch as string | undefined) ?? null;

/**
 * Branches that produce store-bound artifacts, per the Git Flow lite model in
 * `.claude/CLAUDE.md`: `main` is production, and `release/*` exists purely to
 * stabilise a build on its way there.
 *
 * `release/*` matters because Xcode Cloud sets `CI_BRANCH` from a real checkout,
 * so a workflow configured to archive off a release branch would otherwise bake
 * dev affordances into a TestFlight build that reaches external testers and App
 * Review — the exact outcome the gate exists to prevent.
 */
function isStoreBranch(branch: string): boolean {
  return branch === "main" || branch.startsWith("release/");
}

/**
 * The canonical gate for dev-only affordances — anything that must never be
 * reachable in a store build. Import this rather than testing `__DEV__` yourself.
 *
 * True in a dev client, and in any build cut from a branch that is not
 * store-bound.
 *
 * The second arm is the point. `.claude/CLAUDE.md` requires dev affordances to
 * survive **production-profile builds off feature branches**, which is exactly
 * where `__DEV__` is false — gating on `__DEV__` alone would delete them from the
 * one build you most want to test on. A store release is cut from `main` (via
 * `release/*`), so both arms are false there.
 *
 * Both inputs are fixed when the bundle is built: `__DEV__` by Metro, `gitBranch`
 * by the Expo manifest. There is no env var to set and no runtime flag to flip, so
 * a shipped build cannot be talked into enabling this.
 *
 * An unresolvable branch (null) counts as production — see `resolveGitBranch()`
 * for why that direction, and for the remote-EAS-build caveat.
 */
export const isDevBuild: boolean =
  __DEV__ || (gitBranch !== null && !isStoreBranch(gitBranch));

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
