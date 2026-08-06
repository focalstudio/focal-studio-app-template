/**
 * Guards the contract between `.maestro/*.yaml` and the app source.
 *
 * The flows used to assert on screen copy — the onboarding slide titles, the
 * home card's "Welcome", the paywall CTA. Every one of those is the first thing
 * a generated app replaces, so the flows shipped green in the template and
 * failed the first time anyone built their own product (#126). They now address
 * everything by `testID` instead.
 *
 * That only helps if the ids stay put, and nothing else checks them: Maestro
 * runs on PRs to `main` or behind the `e2e` label (#128), and takes 15-25
 * minutes when it does. A `"Start Free Trial"` assertion sat dead in
 * full-journey.yaml for a whole release because the paywall stopped rendering
 * that button and no check connected the two.
 *
 * This is that check, and `ci.yml` runs it on `branches: ["**"]` — so removing a
 * seam fails the PR that removed it, in seconds.
 *
 * Static on purpose: no rendering, no mocks, no router. Same shape as
 * `version-consistency.test.ts`. The flows are read as raw text rather than
 * parsed with `js-yaml`, which is in `node_modules` only transitively — a
 * dedupe away from breaking a test that imported it.
 */

import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const FLOW_DIR = path.join(REPO_ROOT, ".maestro");

/** Where a `testID` may be defined. `__tests__` is excluded: a test asserting on an id does not define it. */
const SOURCE_ROOTS = ["app", "src"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : walk(full);
    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [full] : [];
  });
}

const sources = SOURCE_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root)))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

const flowFiles = fs
  .readdirSync(FLOW_DIR)
  .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"));

/**
 * Every `id:` selector in a flow, as `[id, flow file]`.
 *
 * The leading `(?:^|\s)` is load-bearing: without it this also matches the
 * `appId:` on line 1 of every flow, which is a bundle identifier and not a
 * testID.
 */
const ID_SELECTOR = /(?:^|\s)id:\s*"([^"]+)"/gm;

/**
 * Deduped per flow rather than globally: a flow naming an id four times is one
 * case, but "which flow will break" is worth keeping in the test name.
 */
const referencedIds: [string, string][] = [
  ...new Map(
    flowFiles.flatMap((name) => {
      const contents = fs.readFileSync(path.join(FLOW_DIR, name), "utf8");
      return [...contents.matchAll(ID_SELECTOR)].map(
        (match) => [`${name}::${match[1]}`, [match[1], name] as [string, string]] as const
      );
    })
  ).values(),
];

/** `tabBarButtonTestID` is how a React Navigation tab button gets one. */
function isDefinedInSource(id: string): boolean {
  return (
    sources.includes(`testID="${id}"`) ||
    sources.includes(`testID: "${id}"`) ||
    sources.includes(`tabBarButtonTestID: "${id}"`)
  );
}

describe("Maestro flow → app source contract", () => {
  it("finds flows to check", () => {
    // A rename or a moved directory would otherwise turn every assertion below
    // into a vacuous pass over an empty list.
    expect(flowFiles.length).toBeGreaterThan(0);
    expect(referencedIds.length).toBeGreaterThan(0);
  });

  it.each(referencedIds)('"%s" (used by %s) is defined in the app source', (id, flow) => {
    if (!isDefinedInSource(id)) {
      throw new Error(
        `${flow} selects on id "${id}", but no testID="${id}" exists under app/ or src/.\n` +
          "Either restore the seam on whatever element replaced it, or update the flow to " +
          'match.\nSee "The seams the flows depend on" in docs/testing.md.'
      );
    }
  });

  it("uses no literal text selectors beyond the documented exceptions", () => {
    // Copy is what broke these flows in the first place. The three below cannot
    // be given a testID: "Continue" and "Delete Account" are buttons inside a
    // native `Alert.alert` (no RN tree to attach one to), and "Open" belongs to
    // iOS's own scheme-handoff dialog rather than to the app.
    const ALLOWED_TEXT_SELECTORS = ["Open", "Continue", "Delete Account"];
    const TEXT_SELECTOR = /(?:^|\s)(?:tapOn|assertVisible|assertNotVisible|visible):\s*"([^"]+)"/gm;

    const offenders = flowFiles.flatMap((name) => {
      const contents = fs.readFileSync(path.join(FLOW_DIR, name), "utf8");
      return [...contents.matchAll(TEXT_SELECTOR)]
        .map((match) => match[1])
        .filter((text) => !ALLOWED_TEXT_SELECTORS.includes(text))
        .map((text) => `${name}: "${text}"`);
    });

    expect(offenders).toEqual([]);
  });
});
