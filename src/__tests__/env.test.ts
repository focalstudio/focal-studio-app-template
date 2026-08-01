/**
 * Tests the `isDevBuild` expression itself.
 *
 * Every other test of a dev-only affordance mocks `src/env.ts` wholesale, which
 * proves the *consumer* honours the gate but says nothing about whether the gate
 * is computed correctly. This file is the other half: it exercises the real
 * expression against a real manifest shape, so the store-build case is covered
 * by something.
 *
 * `isDevBuild` is evaluated once at module load, so each case re-imports the
 * module with `jest.isolateModules` after setting up its inputs. That is safe
 * here — unlike in the component tests — because nothing in this file renders,
 * so there is no second copy of React to collide with.
 */

type EnvModule = typeof import("../env");

/** Loads a fresh `src/env.ts` under a given `__DEV__` and manifest branch. */
function loadEnv(opts: { dev: boolean; gitBranch: string | null }): EnvModule {
  const globals = globalThis as unknown as { __DEV__: boolean };
  const previousDev = globals.__DEV__;

  let mod: EnvModule;
  jest.isolateModules(() => {
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: { env: {}, backend: "none", gitBranch: opts.gitBranch },
        },
      },
    }));

    globals.__DEV__ = opts.dev;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("../env") as EnvModule;
    } finally {
      globals.__DEV__ = previousDev;
    }
  });

  return mod!;
}

afterEach(() => {
  jest.dontMock("expo-constants");
});

describe("isDevBuild", () => {
  /**
   * The store-build case. This is the assertion the whole gate exists for: a
   * release is cut from `main` with `__DEV__` false, and no dev-only affordance
   * may survive into it. Do not delete or weaken this.
   */
  it("is false in a non-dev build cut from main", () => {
    expect(loadEnv({ dev: false, gitBranch: "main" }).isDevBuild).toBe(false);
  });

  /**
   * `release/*` is store-bound too. Xcode Cloud sets `CI_BRANCH` from a real
   * checkout, so a workflow archiving off a release branch would otherwise ship
   * dev affordances to TestFlight testers and App Review.
   */
  it("is false in a non-dev build cut from a release branch", () => {
    expect(loadEnv({ dev: false, gitBranch: "release/0.9.0" }).isDevBuild).toBe(false);
  });

  /** `release/*` is a prefix, not a substring — don't over-match. */
  it("does not treat a feature branch merely mentioning release as store-bound", () => {
    expect(loadEnv({ dev: false, gitBranch: "feat/release-notes" }).isDevBuild).toBe(true);
  });

  /**
   * Fail-closed. `resolveGitBranch()` in app.config.js returns null from a
   * detached HEAD or a worker with no `.git`, and an unknown branch must never
   * be treated as "probably not main, so probably fine".
   */
  it("is false when the branch cannot be resolved", () => {
    expect(loadEnv({ dev: false, gitBranch: null }).isDevBuild).toBe(false);
  });

  /**
   * The reason this is not just `__DEV__`: a production-profile build off a
   * feature branch has `__DEV__ === false`, and `.claude/CLAUDE.md` requires dev
   * affordances to survive exactly that build.
   */
  it("is true in a non-dev build cut from a feature branch", () => {
    expect(loadEnv({ dev: false, gitBranch: "feat/x" }).isDevBuild).toBe(true);
  });

  it("is true in a dev client regardless of branch", () => {
    expect(loadEnv({ dev: true, gitBranch: "main" }).isDevBuild).toBe(true);
    expect(loadEnv({ dev: true, gitBranch: null }).isDevBuild).toBe(true);
  });

  it("reads the branch straight off the manifest, defaulting to null", () => {
    expect(loadEnv({ dev: false, gitBranch: "release/1.2.3" }).gitBranch).toBe("release/1.2.3");
    expect(loadEnv({ dev: false, gitBranch: null }).gitBranch).toBeNull();
  });
});
