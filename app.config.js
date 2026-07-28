// Dynamic Expo config — thin wrapper over app.json.
//
// app.json remains the single source of truth: Expo reads it first and passes the
// resolved config in as `config`. We override ONE field here.
//
// Why: the Xcode Cloud hook (ios/ci_scripts/ci_post_clone.sh) runs
// `expo prebuild --platform ios --clean`, which regenerates ios/ from this config on
// every build — so the static app.json `ios.buildNumber` ("1") would ship on every
// archive, and App Store Connect rejects the 2nd upload of a version ("build number
// already used"). Xcode Cloud exposes a monotonic CI_BUILD_NUMBER per workflow run;
// inject it here so each archive gets a unique, increasing CFBundleVersion.
//
// - Xcode Cloud: CI_BUILD_NUMBER is set → unique build number per archive.
// - Local dev / manual prebuild: env var absent → falls back to app.json's value.
// - EAS: unaffected — it uses its own remote `autoIncrement` in eas.json.
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    buildNumber: process.env.CI_BUILD_NUMBER ?? config.ios?.buildNumber,
  },
});
