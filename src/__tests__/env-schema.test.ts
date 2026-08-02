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

const ENV_MODULE = "../../env.js";

/**
 * A value for every backend's variables.
 *
 * `env.js` only *requires* the ones belonging to the backend it has selected,
 * so supplying all of them yields a valid environment whatever `BACKEND` is.
 * That keeps these tests meaningful both in the template (`BACKEND = "none"`)
 * and in an app that has run `scripts/add-backend.sh` — previously they
 * hardcoded the template's default and failed the moment a backend was wired.
 */
const EVERY_BACKEND_CONFIGURED = {
  EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xyz",
  EXPO_PUBLIC_FIREBASE_API_KEY: "AIzaPlaceholder",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "abc.firebaseapp.com",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "abc",
  EXPO_PUBLIC_FIREBASE_APP_ID: "1:2:web:3",
};

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

  it("accepts a fully configured Supabase environment", () => {
    expect(() =>
      loadEnv({
        EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xyz",
      })
    ).not.toThrow();
  });

  it("exposes validated values and the selected backend", () => {
    const { env, BACKEND } = loadEnv({
      ...EVERY_BACKEND_CONFIGURED,
      EXPO_PUBLIC_POSTHOG_KEY: "phc_abc",
    });
    expect(env.EXPO_PUBLIC_POSTHOG_KEY).toBe("phc_abc");
    expect(["none", "supabase", "firebase"]).toContain(BACKEND);
  });

  // The rule that makes BACKEND load-bearing: selecting a provider promotes its
  // variables from optional to required. Asserted against whichever backend is
  // actually wired, so it holds in the template and in a generated app alike.
  it("requires the selected backend's variables, and only then", () => {
    const { BACKEND } = loadEnv(EVERY_BACKEND_CONFIGURED);

    if (BACKEND === "none") {
      expect(() => loadEnv({})).not.toThrow();
    } else {
      expect(() => loadEnv({})).toThrow(new RegExp(BACKEND));
    }
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

  it("names every offending variable in one message", () => {
    expect(() =>
      loadEnv({
        EXPO_PUBLIC_SUPABASE_URL: "not-a-url",
        EXPO_PUBLIC_POSTHOG_HOST: "also-not-a-url",
      })
    ).toThrow(/EXPO_PUBLIC_POSTHOG_HOST/);
  });
});
