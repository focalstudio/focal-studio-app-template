/**
 * Guards `stripDevBypass()` in `app.config.js`.
 *
 * This is the half of the dev sign-in bypass that the component's `isDevBuild`
 * gate cannot cover. `EXPO_PUBLIC_*` values are inlined into the JS bundle, so
 * hiding the button does nothing about the password sitting in `extra.env` — a
 * credential left in a production EAS environment group would ship either way.
 * These tests assert it is dropped from every store-bound build.
 *
 * `app.config.js` requires `env.js`, which validates on require, so each case
 * re-requires it under a mutated `process.env` with the module cache cleared.
 */

const CONFIG_MODULE = "../../app.config.js";

const BYPASS = {
  EXPO_PUBLIC_DEV_BYPASS_EMAIL: "dev@example.test",
  EXPO_PUBLIC_DEV_BYPASS_PASSWORD: "hunter2",
};

type Extra = { env: Record<string, string | undefined>; gitBranch: string | null };

/**
 * Loads app.config.js as if built on `branch`, and returns the resolved
 * `extra`. A null branch simulates the unresolvable case (a remote EAS build:
 * no CI variables, no `.git`) by making `execSync` throw.
 */
function loadExtra(branch: string | null, vars: Record<string, string> = BYPASS): Extra {
  const original = process.env;
  process.env = {
    ...vars,
    ...(branch === null ? {} : { GITHUB_REF_NAME: branch }),
  } as NodeJS.ProcessEnv;

  try {
    jest.resetModules();
    if (branch === null) {
      jest.doMock("child_process", () => ({
        execSync: () => {
          throw new Error("not a git repository");
        },
      }));
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require(CONFIG_MODULE) as (arg: { config: object }) => { extra: Extra };
    return config({ config: {} }).extra;
  } finally {
    process.env = original;
    jest.dontMock("child_process");
  }
}

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("app.config.js — dev bypass credential stripping", () => {
  it("keeps the credentials on a feature branch, where the bypass is meant to work", () => {
    const extra = loadExtra("feat/some-feature");

    expect(extra.env.EXPO_PUBLIC_DEV_BYPASS_EMAIL).toBe("dev@example.test");
    expect(extra.env.EXPO_PUBLIC_DEV_BYPASS_PASSWORD).toBe("hunter2");
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["main", "release/1.0.0"])(
    "strips the credentials from a build cut off %s",
    (branch) => {
      const extra = loadExtra(branch);

      expect(extra.env).not.toHaveProperty("EXPO_PUBLIC_DEV_BYPASS_EMAIL");
      expect(extra.env).not.toHaveProperty("EXPO_PUBLIC_DEV_BYPASS_PASSWORD");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("store-bound"));
    }
  );

  // Fails closed, the same rule `isDevBuild` applies to an unresolvable branch:
  // a missing dev convenience costs an inconvenience, a shipped credential costs
  // a store incident.
  it("strips the credentials when the branch cannot be resolved", () => {
    const extra = loadExtra(null);

    expect(extra.gitBranch).toBeNull();
    expect(extra.env).not.toHaveProperty("EXPO_PUBLIC_DEV_BYPASS_EMAIL");
    expect(extra.env).not.toHaveProperty("EXPO_PUBLIC_DEV_BYPASS_PASSWORD");
  });

  it("leaves every other variable alone while stripping", () => {
    const extra = loadExtra("main", { ...BYPASS, EXPO_PUBLIC_POSTHOG_KEY: "phc_abc" });

    expect(extra.env.EXPO_PUBLIC_POSTHOG_KEY).toBe("phc_abc");
  });

  it("does not warn on a store branch when no bypass credentials are set", () => {
    const extra = loadExtra("main", {});

    expect(extra.env).not.toHaveProperty("EXPO_PUBLIC_DEV_BYPASS_EMAIL");
    expect(warn).not.toHaveBeenCalled();
  });
});
