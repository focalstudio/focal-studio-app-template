import { APP_VERSION, DEV_MODE_KEY, STORAGE_PREFIX } from "../constants";
import appJson from "../../app.json";
import packageJson from "../../package.json";

describe("version consistency", () => {
  it("APP_VERSION in constants.ts matches package.json version", () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it("DEV_MODE_KEY is scoped to the current APP_VERSION", () => {
    expect(DEV_MODE_KEY.endsWith(`_dev_mode_${APP_VERSION}`)).toBe(true);
  });

  it("DEV_MODE_KEY is namespaced by STORAGE_PREFIX", () => {
    expect(DEV_MODE_KEY).toBe(`${STORAGE_PREFIX}dev_mode_${APP_VERSION}`);
  });

  // The assertions above are structural now that constants.ts derives its values
  // from package.json. This is the one that can still fail in practice: app.json
  // is bumped by a separate sed in scripts/bump-version.sh, so it is the only
  // place the version can realistically drift out of sync.
  it("app.json version matches package.json version", () => {
    expect(appJson.expo.version).toBe(packageJson.version);
  });
});
