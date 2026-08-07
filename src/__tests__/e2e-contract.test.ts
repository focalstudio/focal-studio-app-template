/**
 * Guards the contract between `.maestro/*.yaml` and the app source.
 *
 * The flows used to assert on screen copy — the onboarding slide titles, the
 * home card's "Welcome", the paywall CTA. Every one of those is the first thing
 * a generated app replaces, so the flows shipped green in the template and
 * failed the first time anyone built their own product (#126). They now address
 * everything by `testID` instead.
 *
 * That only helps if the seams stay put, and nothing else checks them in time:
 * Maestro runs on PRs to `main`, behind the `e2e` label, and on a weekly cron
 * against `dev` (#128), and takes 15-25 minutes when it does. A
 * `"Start Free Trial"` assertion sat dead in full-journey.yaml for a whole
 * release because the paywall stopped rendering that button and no check
 * connected the two.
 *
 * This is that check, and `ci.yml` runs it on `branches: ["**"]` — so removing a
 * seam fails the PR that removed it, in seconds. Four things are checked: every
 * `id:` selector resolves to a `testID` in source; no new literal text selectors
 * appear; the two app-owned text selectors that cannot be given a testID are
 * still present in source; and the flows swipe once per onboarding slide.
 *
 * What it cannot see is a `testID` that is still in the source while the element
 * carrying it stopped being rendered or reachable — a screen dropped from the
 * navigator, a row moved behind a new gate. Only a real run finds that, which is
 * what the weekly cron above is for.
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
 * A flow's commands, with comment lines dropped.
 *
 * Both headers here are long and quote selectors while explaining them, so
 * without this a comment could invent a required id, or trip the text-selector
 * check with an example of the thing it is warning you not to do. Whole-line
 * comments only — a `#` inside a quoted selector is not one.
 */
function commandsOf(flowFile: string): string {
  return fs
    .readFileSync(path.join(FLOW_DIR, flowFile), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

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
    flowFiles.flatMap((name) =>
      [...commandsOf(name).matchAll(ID_SELECTOR)].map(
        (match) => [`${name}::${match[1]}`, [match[1], name] as [string, string]] as const
      )
    )
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

/**
 * The text selectors the flows are allowed to keep, split by who owns the copy.
 *
 * Copy is what broke these flows in the first place (#126), so the rule is that
 * every selector is a `testID`. These three cannot be: "Continue" and "Delete
 * Account" are buttons inside a native `Alert.alert`, which has no React Native
 * tree to attach a testID to, and "Open" belongs to iOS's own scheme-handoff
 * dialog rather than to the app.
 *
 * The split is what makes any of them checkable. The first two are *app* copy —
 * they live in `handleDeleteAccount` in app/(tabs)/settings.tsx, so a rewording
 * shows up in the source and the test below can see it. "Open" is the OS's: it
 * appears nowhere in this repo and never will, so demanding it in source would
 * fail forever. That asymmetry is the whole reason for two lists (#128).
 */
const APP_TEXT_SELECTORS = ["Continue", "Delete Account"];
const OS_TEXT_SELECTORS = ["Open"];
const ALLOWED_TEXT_SELECTORS = [...APP_TEXT_SELECTORS, ...OS_TEXT_SELECTORS];

/**
 * How many onboarding slides the app ships, counted from the ids it defines.
 *
 * Deduped by index, so an id named twice cannot inflate it. Both spellings are
 * accepted because the template defines these inside the `SLIDES` array in
 * app/onboarding.tsx (`testID: "..."`) while other screens use the JSX form.
 */
const SLIDE_ID_DEFINITION = /testID[=:]\s*"onboarding-slide-(\d+)"/g;
const slideCount = new Set([...sources.matchAll(SLIDE_ID_DEFINITION)].map((match) => match[1])).size;

/** A `- swipe:` command. `commandsOf` has already dropped comment lines. */
const SWIPE_COMMAND = /(?:^|\n)\s*-\s*swipe\b/g;

/**
 * How many times a flow swipes to get *through onboarding* — everything before
 * it first taps `onboarding-cta`.
 *
 * Scoped that way on purpose. A whole-file swipe count would break the first
 * time a generated app adds a swipe-to-delete row to a list, which is a LEFT
 * swipe like the onboarding ones and extremely common. Nothing after the
 * onboarding CTA can be part of onboarding, so the cut is exact and free.
 *
 * `null` means "not comparable", and there are two of those: a flow that never
 * completes onboarding, and one that taps its way through with the Next button
 * instead of swiping. Neither is wrong, so neither should fail.
 */
function onboardingSwipesOf(flowFile: string): number | null {
  const commands = commandsOf(flowFile);
  const ctaAt = commands.indexOf('id: "onboarding-cta"');
  if (ctaAt === -1) return null;
  const swipes = [...commands.slice(0, ctaAt).matchAll(SWIPE_COMMAND)].length;
  return swipes === 0 ? null : swipes;
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
    /**
     * Both selector shapes Maestro accepts, or this check has a hole big enough
     * to walk the original bug back through:
     *
     *   - tapOn: "Welcome"        ← the shorthand
     *   - tapOn:
     *       text: "Welcome"       ← the object form, same brittle selector
     *
     * `text` therefore sits in the same alternation as the commands, since in
     * the object form it is the key carrying the copy. `scrollUntilVisible`'s
     * `element:` and `extendedWaitUntil`'s `visible:` nest one level deeper and
     * are covered by the same `text` case.
     */
    const TEXT_SELECTOR =
      /(?:^|\s)(?:tapOn|assertVisible|assertNotVisible|visible|text):\s*"([^"]+)"/gm;

    const offenders = flowFiles.flatMap((name) => {
      return [...commandsOf(name).matchAll(TEXT_SELECTOR)]
        .map((match) => match[1])
        .filter((text) => !ALLOWED_TEXT_SELECTORS.includes(text))
        .map((text) => `${name}: "${text}"`);
    });

    expect(offenders).toEqual([]);
  });

  it("still finds each app-owned text selector in the app source", () => {
    // The check above proves the flows use no *new* copy selectors. It says
    // nothing about the two it lets through, and those have a known break:
    // reword the delete-account alert and both flows tap a button that no
    // longer exists — full-journey.yaml then walks a live account deletion
    // halfway and asserts against a screen it never reached.
    //
    // Deliberately loose. It asks only "does this string still exist as a
    // literal anywhere under app/ or src/", not "is it still button 2 of the
    // second alert in handleDeleteAccount". Pinning it to that function would
    // false-fail every app that moves the alert somewhere else, and moving it
    // is fine — deleting the copy is not. Both quote styles are accepted for
    // the same reason: this repo is prettier-double-quoted, a generated app
    // need not be.
    //
    // The cost of loose is a false negative: "Continue" is also a Button label
    // in app/paywall.tsx, so an app that rewords the alert but keeps that
    // button still passes. Accepted — the common failure is deleting or
    // rewriting the whole Danger Zone, which this does catch.
    //
    // An offenders array rather than `it.each(APP_TEXT_SELECTORS)`, here and in
    // the slide check below: Jest throws on an empty `.each` table, and an app
    // that drops account deletion empties this list legitimately.
    const missing = APP_TEXT_SELECTORS.filter(
      (text) => !sources.includes(`"${text}"`) && !sources.includes(`'${text}'`)
    ).map(
      (text) =>
        `"${text}" is selected on by a flow but appears nowhere under app/ or src/. ` +
        "Either restore the copy, or update the flows and APP_TEXT_SELECTORS together."
    );

    expect(missing).toEqual([]);
  });

  it("swipes once per onboarding slide", () => {
    // The id check cannot see this one. An app that ships FIVE slides defines
    // onboarding-slide-1..5, so every id full-journey.yaml names still resolves
    // and the guard goes green — while the flow swipes twice, lands on slide 3,
    // and taps `onboarding-cta`, which on a non-final slide is labelled "Next"
    // and simply advances the pager (app/onboarding.tsx `handleNext`). The flow
    // then waits for the auth wall from inside onboarding and dies on a timeout
    // 20 minutes into a macOS run. Two slides is the benign direction: the id
    // check catches that one, because onboarding-slide-3 stops existing.
    //
    // Skipped entirely when the app names its slides something else
    // (slideCount === 0) rather than guessing — the ids are the app's to choose,
    // and the flows referencing them are already covered above.
    if (slideCount === 0) return;

    const mismatched = flowFiles
      .map((name) => [name, onboardingSwipesOf(name)] as const)
      .filter(([, swipes]) => swipes !== null && swipes !== slideCount - 1)
      .map(
        ([name, swipes]) =>
          `${name} swipes ${swipes}x before tapping onboarding-cta, but the app defines ` +
          `${slideCount} onboarding slides (expected ${slideCount - 1} swipes).`
      );

    expect(mismatched).toEqual([]);
  });
});
