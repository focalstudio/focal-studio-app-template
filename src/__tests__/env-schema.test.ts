/**
 * Guards `env.js`, which runs at build time via `app.config.js`.
 *
 * The point of the schema is that a misconfigured environment fails the build
 * with a readable message instead of surfacing as `undefined` at runtime. These
 * tests assert it actually rejects what it claims to.
 *
 * `env.js` validates on require, so each case re-requires it under a mutated
 * `process.env` with the module cache cleared.
 */

import {
  BACKEND_VARS,
  PAYWALL_VARS,
  EVERY_BACKEND_CONFIGURED,
  type BackendName,
  type PaywallName,
} from "./support/backendEnv";

const ENV_MODULE = "../../env.js";

function loadEnv(vars: Record<string, string | undefined>) {
  const original = process.env;
  process.env = { ...vars } as NodeJS.ProcessEnv;
  try {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(ENV_MODULE);
  } finally {
    process.env = original;
  }
}

describe("env.js schema", () => {
  it("accepts an environment that satisfies the selected backend", () => {
    expect(() => loadEnv(EVERY_BACKEND_CONFIGURED)).not.toThrow();
  });

  /*
   * The minimal case: exactly what the wired providers need and nothing else.
   *
   * Reads BOTH selectors, not just BACKEND. This was hardcoded to Supabase once
   * and broke when Firebase could be selected (#100); it then read only BACKEND
   * and broke again the moment `add-paywall.sh` could set PAYWALL. Anything that
   * promotes variables from optional to required has to appear here.
   */
  it("accepts exactly the selected providers' variables and nothing else", () => {
    const { BACKEND, PAYWALL } = loadEnv(EVERY_BACKEND_CONFIGURED) as {
      BACKEND: BackendName;
      PAYWALL: PaywallName;
    };

    expect(() =>
      loadEnv({ ...BACKEND_VARS[BACKEND], ...PAYWALL_VARS[PAYWALL] })
    ).not.toThrow();
  });

  it("exposes validated values and both selectors", () => {
    const { env, BACKEND, PAYWALL } = loadEnv({
      ...EVERY_BACKEND_CONFIGURED,
      EXPO_PUBLIC_POSTHOG_KEY: "phc_abc",
    });
    expect(env.EXPO_PUBLIC_POSTHOG_KEY).toBe("phc_abc");
    expect(["none", "supabase", "firebase"]).toContain(BACKEND);
    expect(["none", "revenuecat"]).toContain(PAYWALL);
  });

  // The rule that makes BACKEND and PAYWALL load-bearing: selecting a provider
  // promotes its variables from optional to required. Asserted against whatever
  // is actually wired, so it holds in the template and in a generated app alike.
  it("requires the selected providers' variables, and only then", () => {
    const { BACKEND, PAYWALL } = loadEnv(EVERY_BACKEND_CONFIGURED);

    if (BACKEND === "none" && PAYWALL === "none") {
      expect(() => loadEnv({})).not.toThrow();
      return;
    }

    expect(() => loadEnv({})).toThrow(new RegExp(BACKEND === "none" ? PAYWALL : BACKEND));
  });

  /*
   * Swapping the Apple and Google RevenueCat keys is the classic mistake, and at
   * runtime it surfaces as an opaque "invalid credentials" with nothing pointing
   * at the cause. The prefix check is what turns that into a build failure.
   */
  it.each([
    ["EXPO_PUBLIC_REVENUECAT_IOS_API_KEY", "goog_wrongplatform"],
    ["EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY", "appl_wrongplatform"],
  ])("rejects a %s carrying the other platform's prefix", (key, value) => {
    expect(() => loadEnv({ ...EVERY_BACKEND_CONFIGURED, [key]: value })).toThrow(
      new RegExp(key)
    );
  });

  it("accepts correctly prefixed RevenueCat keys", () => {
    expect(() =>
      loadEnv({ ...EVERY_BACKEND_CONFIGURED, ...PAYWALL_VARS.revenuecat })
    ).not.toThrow();
  });

  // The common real-world failure: one variable gets copied out of the
  // dashboard and the other is forgotten, so the client builds a request
  // against an undefined key and fails with a confusing 401.
  it("rejects a half-configured Supabase environment (URL without key)", () => {
    expect(() =>
      loadEnv({ EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })
    ).toThrow(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejects a half-configured Supabase environment (key without URL)", () => {
    expect(() =>
      loadEnv({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xyz" })
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it("rejects a malformed URL", () => {
    expect(() =>
      loadEnv({
        EXPO_PUBLIC_SUPABASE_URL: "abc.supabase.co",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xyz",
      })
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  // Same half-configured trap as Supabase above, with a quieter failure: the
  // bypass button's gate requires both, so one alone leaves it permanently
  // hidden with nothing to explain why.
  it("accepts both dev bypass credentials together", () => {
    expect(() =>
      loadEnv({
        ...EVERY_BACKEND_CONFIGURED,
        EXPO_PUBLIC_DEV_BYPASS_EMAIL: "dev@example.test",
        EXPO_PUBLIC_DEV_BYPASS_PASSWORD: "hunter2",
      })
    ).not.toThrow();
  });

  it("rejects a dev bypass email without a password", () => {
    expect(() =>
      loadEnv({ EXPO_PUBLIC_DEV_BYPASS_EMAIL: "dev@example.test" })
    ).toThrow(/EXPO_PUBLIC_DEV_BYPASS_PASSWORD/);
  });

  it("rejects a dev bypass password without an email", () => {
    expect(() => loadEnv({ EXPO_PUBLIC_DEV_BYPASS_PASSWORD: "hunter2" })).toThrow(
      /EXPO_PUBLIC_DEV_BYPASS_EMAIL/
    );
  });

  it("rejects a malformed dev bypass email", () => {
    expect(() =>
      loadEnv({
        EXPO_PUBLIC_DEV_BYPASS_EMAIL: "not-an-email",
        EXPO_PUBLIC_DEV_BYPASS_PASSWORD: "hunter2",
      })
    ).toThrow(/EXPO_PUBLIC_DEV_BYPASS_EMAIL/);
  });

  // Optional even on the Firebase backend: social sign-in is opt-in, so
  // requiring it would break every Firebase app that only wants email or Apple.
  // `social.ts` calls requireEnv() at the point of use instead.
  it("accepts a Firebase environment with no Google client ID", () => {
    expect(() => loadEnv(EVERY_BACKEND_CONFIGURED)).not.toThrow();
  });

  it("accepts a well-formed Google iOS client ID", () => {
    expect(() =>
      loadEnv({
        ...EVERY_BACKEND_CONFIGURED,
        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "123-abc.apps.googleusercontent.com",
      })
    ).not.toThrow();
  });

  // The reversed form is what goes in app.json's CFBundleURLSchemes, and the two
  // are easy to mix up. Pasting it here yields a browser that opens and never
  // returns — worth catching at build time rather than on a device.
  it.each([
    ["the reversed URL scheme", "com.googleusercontent.apps.123-abc"],
    ["a bare ID", "123-abc"],
  ])("rejects %s in place of the Google iOS client ID", (_label, value) => {
    expect(() =>
      loadEnv({ ...EVERY_BACKEND_CONFIGURED, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: value })
    ).toThrow(/EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/);
  });

  it("names every offending variable in one message", () => {
    expect(() =>
      loadEnv({
        EXPO_PUBLIC_SUPABASE_URL: "not-a-url",
        EXPO_PUBLIC_POSTHOG_HOST: "also-not-a-url",
      })
    ).toThrow(/EXPO_PUBLIC_POSTHOG_HOST/);
  });
});
