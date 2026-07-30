const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  // Backend adapter sources. They import SDKs the template deliberately does
  // not install, so they cannot resolve until `scripts/add-backend.sh` copies
  // one into src/services/auth/ and installs its dependencies. Also excluded
  // from tsconfig.json for the same reason.
  { ignores: ["templates/backends/**"] },
  ...expoConfig,
]);
