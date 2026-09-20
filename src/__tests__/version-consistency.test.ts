import fs from "fs";
import path from "path";

import { APP_VERSION, DEV_MODE_KEY, STORAGE_PREFIX } from "../constants";
import appJson from "../../app.json";
import packageJson from "../../package.json";

const REPO_ROOT = path.resolve(__dirname, "../..");
const SEMVER = /^\d+\.\d+\.\d+$/;

// The template still carries its placeholders; a generated app does not. Same
// bootstrap tell app.json gives maestro-e2e.yml's gate and drift-report.sh's
// direction detection.
const IS_TEMPLATE = JSON.stringify(appJson).includes("[APP_NAME]");

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

// TEMPLATE_VERSION records which template release this repo is on. It is the
// input to drift-report.sh's fork point and to the fleet report's TEMPLATE
// column, both of which silently degrade to a worse heuristic when it is
// malformed rather than failing — so the assertion has to live here.
describe("TEMPLATE_VERSION", () => {
  const raw = fs.readFileSync(path.join(REPO_ROOT, "TEMPLATE_VERSION"), "utf8");

  it("is a bare semver version", () => {
    expect(raw.trim()).toMatch(SEMVER);
  });

  it("has no leading or trailing content beyond a single newline", () => {
    // Consumers read it with `tr -d '[:space:]'`, but a stray second line would
    // be silently concatenated rather than rejected.
    expect(raw).toBe(`${raw.trim()}\n`);
  });

  // In the template the file tracks the template's own version, and
  // scripts/bump-version.sh moves both together. In a generated app the two are
  // expected to differ — the app is on its own version while TEMPLATE_VERSION
  // records the template release it last adopted — so this assertion is scoped.
  (IS_TEMPLATE ? it : it.skip)(
    "matches package.json version while this is still the template",
    () => {
      expect(raw.trim()).toBe(packageJson.version);
    },
  );
});
