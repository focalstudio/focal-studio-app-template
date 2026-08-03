/**
 * Jest configuration.
 *
 * This lives in its own file rather than package.json's `"jest"` key for one
 * reason: `transformIgnorePatterns` has to be *derived* from jest-expo's rather
 * than restated, and a JSON block cannot run code. See the splice below.
 *
 * Everything else here is the same three keys package.json used to hold.
 */

const preset = require("jest-expo/jest-preset");

/**
 * Packages that ship untranspiled ESM and so must be transformed rather than
 * ignored.
 *
 * `firebase` / `@firebase` are NOT dependencies of the template as shipped —
 * `scripts/add-backend.sh firebase` installs them. They are listed
 * unconditionally anyway: the pattern simply never matches when the package is
 * absent, and the alternative is `add-backend.sh` patching Jest config, which
 * is far worse. Without this, every suite whose import graph reaches
 * `src/services/auth/index.ts` dies at parse time with "Cannot use import
 * statement outside a module" the moment the Firebase backend is wired (#100).
 */
const ESM_PACKAGES = ["firebase", "@firebase"];

/**
 * jest-expo expresses its allowlist as a single negative lookahead —
 * `/node_modules/(?!(.pnpm|react-native|@react-native|…))` — so a package is
 * transformed only if it appears *inside* that group.
 *
 * Appending a separate pattern cannot achieve this: `transformIgnorePatterns`
 * is an OR of things to ignore, so extra entries can only ever ignore more,
 * never less. Splicing into the existing lookahead is the only way in.
 */
const ALLOWLIST_PREFIX = "/node_modules/(?!(";

function allowEsm(pattern) {
  return pattern.startsWith(ALLOWLIST_PREFIX)
    ? pattern.replace(ALLOWLIST_PREFIX, `${ALLOWLIST_PREFIX}${ESM_PACKAGES.join("|")}|`)
    : pattern;
}

const transformIgnorePatterns = preset.transformIgnorePatterns.map(allowEsm);

/**
 * Fail loudly if the splice found nothing to splice into.
 *
 * An Expo SDK bump is free to reshape that pattern. If it does, a silent no-op
 * here would put the ESM parse failure back with no signal at all — and it only
 * reproduces once a backend is wired, which CI would not have caught before
 * #100. Throwing at config load is the cheapest possible place to learn this.
 */
if (transformIgnorePatterns.join("\n") === preset.transformIgnorePatterns.join("\n")) {
  throw new Error(
    `jest.config.js: no jest-expo transformIgnorePatterns entry started with "${ALLOWLIST_PREFIX}", ` +
      `so ${ESM_PACKAGES.join("/")} would not be transformed. jest-expo's preset shape has ` +
      "changed — re-derive the splice before Firebase tests start failing. See issue #100."
  );
}

/**
 * jest-expo transforms `\.[jt]sx?$` — which does not include `.mjs`.
 *
 * Allowing `@firebase` past `transformIgnorePatterns` is therefore only half
 * the job: `@firebase/util` resolves to a genuine `.mjs` file
 * (`dist/postinstall.mjs`), which then reaches the runtime untransformed and
 * fails with "Unexpected token 'export'" — a second, near-identical error two
 * layers below the first.
 *
 * The babel entry is looked up rather than restated so it keeps the preset's
 * exact babel options (root, `configFile`, the metro caller).
 */
const babelEntry = Object.entries(preset.transform).find(
  ([, transformer]) => (Array.isArray(transformer) ? transformer[0] : transformer) === "babel-jest"
);

if (babelEntry === undefined) {
  throw new Error(
    "jest.config.js: jest-expo's preset has no babel-jest transform to reuse for .mjs files. " +
      "Its preset shape has changed — re-derive this before ESM dependencies start failing. See issue #100."
  );
}

module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.js"],
  setupFilesAfterEnv: ["./jest.setup.after-env.js"],
  transformIgnorePatterns,
  transform: {
    ...preset.transform,
    "\\.mjs$": babelEntry[1],
  },
  /**
   * Jest's default `testMatch` treats *every* file under `__tests__/` as a
   * suite, so shared fixtures need somewhere to live that isn't one.
   */
  testPathIgnorePatterns: ["/node_modules/", "/__tests__/support/"],
};
