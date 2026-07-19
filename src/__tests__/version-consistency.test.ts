import { APP_VERSION, DEV_MODE_KEY } from "../constants";
import packageJson from "../../package.json";

describe("version consistency", () => {
  it("APP_VERSION in constants.ts matches package.json version", () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it("DEV_MODE_KEY is scoped to the current APP_VERSION", () => {
    expect(DEV_MODE_KEY.endsWith(`_dev_mode_${APP_VERSION}`)).toBe(true);
  });
});
