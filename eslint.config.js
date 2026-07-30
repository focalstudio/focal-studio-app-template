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
  { ignores: ["templates/**"] },
  ...expoConfig,
]);
