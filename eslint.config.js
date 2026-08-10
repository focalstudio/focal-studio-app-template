const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  // Backend adapters and social sign-in modules. They import SDKs and native
  // modules the template deliberately does not install, so they cannot resolve
  // until `scripts/add-backend.sh` or `scripts/add-social-auth.sh` copies one
  // into src/services/auth/ and installs its dependencies. Also excluded from
  // tsconfig.json for the same reason.
  //
  // The trade-off: these files get no CI checking at all. Keep them thin, and
  // type-check them by running the scripts in a scratch app (see the docs).
  //
  // `.claude/scratch/**` holds the generated-app clones that
  // `scripts/drift-report.sh` caches. Gitignored, so CI never sees it — but ESLint
  // walks dot-directories, and a local `npm run lint` after a drift run otherwise
  // reports several hundred findings from other people's repos. (tsc and Jest do
  // not need this: TypeScript's globs skip dot-directories, and jest.config.js
  // ignores the path explicitly.)
  { ignores: ["templates/**", ".claude/scratch/**"] },
  ...expoConfig,
]);
