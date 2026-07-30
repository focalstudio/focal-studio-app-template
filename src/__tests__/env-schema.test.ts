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
  it("accepts an empty environment — the template ships with no backend", () => {
    expect(() => loadEnv({})).not.toThrow();
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
      EXPO_PUBLIC_POSTHOG_KEY: "phc_abc",
    });
    expect(env.EXPO_PUBLIC_POSTHOG_KEY).toBe("phc_abc");
    expect(BACKEND).toBe("none");
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

  it("names every offending variable in one message", () => {
    expect(() =>
      loadEnv({
        EXPO_PUBLIC_SUPABASE_URL: "not-a-url",
        EXPO_PUBLIC_POSTHOG_HOST: "also-not-a-url",
      })
    ).toThrow(/EXPO_PUBLIC_POSTHOG_HOST/);
  });
});
