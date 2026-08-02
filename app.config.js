// Dynamic Expo config — thin wrapper over app.json.
//
// app.json remains the single source of truth: Expo reads it first and passes the
// resolved config in as `config`. We override two things here.
//
// 1. ios.buildNumber
//
// The Xcode Cloud hook (ios/ci_scripts/ci_post_clone.sh) runs
// `expo prebuild --platform ios --clean`, which regenerates ios/ from this config on
// every build — so the static app.json `ios.buildNumber` ("1") would ship on every
// archive, and App Store Connect rejects the 2nd upload of a version ("build number
// already used"). Xcode Cloud exposes a monotonic CI_BUILD_NUMBER per workflow run;
// inject it here so each archive gets a unique, increasing CFBundleVersion.
//
// - Xcode Cloud: CI_BUILD_NUMBER is set → unique build number per archive.
// - Local dev / manual prebuild: env var absent → falls back to app.json's value.
// - EAS: unaffected — it uses its own remote `autoIncrement` in eas.json.
//
// 2. extra.env
//
// Requiring ./env.js validates the environment as a side effect, so a missing or
// malformed variable fails the build here rather than surfacing as `undefined` at
// runtime on a user's device. The validated values are published into the manifest
// under `extra.env`, which is what src/env.ts reads.
//
// 3. extra.gitBranch
//
// Baked in here so `isDevBuild` (src/env.ts) reads a build-time constant rather
// than anything that can be flipped on a device. See resolveGitBranch below.
//
// 4. Stripping EXPO_PUBLIC_DEV_BYPASS_* on store-bound branches
//
// The dev sign-in bypass button is hidden by `isDevBuild`, but that gate hides
// the control, not the credential — see stripDevBypass below.
const { execSync } = require("child_process");

const { env, BACKEND } = require("./env");

/**
 * The branch this build was cut from, or null when it cannot be determined.
 *
 * Precedence — CI first, because a CI checkout is often detached at a commit and
 * would otherwise report "HEAD":
 *
 * - GITHUB_REF_NAME — GitHub Actions. On a `pull_request` event this is a merge
 *                     ref ("123/merge"), not a branch. Harmless today because no
 *                     workflow builds a distributable artifact on that trigger —
 *                     if you add one, gate it here rather than relying on that.
 * - CI_BRANCH       — Xcode Cloud.
 * - `git rev-parse` — local `expo start` / `expo prebuild` / `eas build --local`.
 *
 * Anything unresolvable returns null, and `isDevBuild` treats null as production.
 * Failing closed is deliberate: the cost of a wrong `null` is that a dev-only
 * affordance is missing from a build where it would have been convenient; the
 * cost of a wrong branch name is shipping that affordance to the App Store.
 *
 * Known limitation: a *remote* EAS build has neither of the CI variables nor a
 * `.git` directory (the CLI uploads a tarball built from git, not the repo
 * itself), so this returns null there and dev-only affordances are absent. Use a
 * development-profile build, or `eas build --local` from CI, when you need them.
 */
function resolveGitBranch() {
  const fromCI = process.env.GITHUB_REF_NAME || process.env.CI_BRANCH;
  if (fromCI) return fromCI;

  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    // Detached HEAD reports the literal "HEAD" — not a branch, so not a signal.
    return branch && branch !== "HEAD" ? branch : null;
  } catch {
    return null;
  }
}

/**
 * Removes the dev sign-in bypass credentials from a store-bound build.
 *
 * `isDevBuild` keeps the button off the screen, but the password is a plain
 * string in `extra.env` — a determined reader of the bundle would still find a
 * working account. So the credential is dropped at the point it would enter the
 * manifest, not merely gated at the point it would be used.
 *
 * Fails closed on an unresolvable branch, the same rule `isDevBuild` applies:
 * the cost of a wrong strip is a missing dev convenience, the cost of a wrong
 * keep is a live credential in the App Store.
 *
 * Returns a copy — `env` is env.js's module export, shared with anything else
 * that requires it.
 */
function stripDevBypass(values, branch) {
  const storeBound =
    branch === null || branch === "main" || branch.startsWith("release/");
  if (!storeBound || !values.EXPO_PUBLIC_DEV_BYPASS_EMAIL) return values;

  console.warn(
    `⚠️  EXPO_PUBLIC_DEV_BYPASS_* is set, but this build is store-bound ` +
      `(${branch ?? "branch could not be resolved"}). Stripping it from the ` +
      `manifest so the credential does not ship. Remove it from this ` +
      `environment — the bypass is for feature branches only.`
  );

  const stripped = { ...values };
  delete stripped.EXPO_PUBLIC_DEV_BYPASS_EMAIL;
  delete stripped.EXPO_PUBLIC_DEV_BYPASS_PASSWORD;
  return stripped;
}

module.exports = ({ config }) => {
  const gitBranch = resolveGitBranch();

  return {
    ...config,
    ios: {
      ...config.ios,
      buildNumber: process.env.CI_BUILD_NUMBER ?? config.ios?.buildNumber,
    },
    extra: {
      ...config.extra,
      env: stripDevBypass(env, gitBranch),
      backend: BACKEND,
      gitBranch,
    },
  };
};
