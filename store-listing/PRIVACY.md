# Privacy policy generation

Each app gets its **own** privacy page at
`https://focalstudio.github.io/privacy-<app-slug>.html`, generated from the app's data
practices and published to the [`focalstudio.github.io`](https://github.com/focalstudio/focalstudio.github.io)
Pages repo. One template, adjusted per app — **never** a single shared policy (apps with
different data practices cannot be truthfully described by one page, which is a common
store-rejection cause).

## Files

| File | Role |
|------|------|
| `privacy-policy-template.html` | Reference/annotated placeholder policy (human copy-out fallback). |
| `privacy-shell.html` | Standalone page shell (self-contained CSS) matching the published pages. Generator fills its `{{TOKENS}}`. |
| `privacy.config.example.json` | Copy to `privacy.config.json` and edit for your app. |
| `privacy.config.json` | **Your app's** data practices (gitignored-free; commit it). Drives generation. |

## Generate

```bash
cp store-listing/privacy.config.example.json store-listing/privacy.config.json
# edit privacy.config.json for your app
node scripts/gen-privacy-policy.mjs
```

Output: `store-listing/privacy-<slug>.html` (slug comes from `APP_SLUG` in
`src/constants.ts`). The generator **fails** if any `[PLACEHOLDER]` remains, the `#delete`
anchor is missing, or `PRIVACY_POLICY_URL` in `src/constants.ts` does not end with
`privacy-<slug>.html` — so a broken page can never be produced silently.

## Publish

Run the **Publish Privacy Policy** workflow
(`.github/workflows/publish-privacy.yml`, Actions → Run workflow). It regenerates the page,
diffs it against the live one, and opens a PR adding or updating `privacy-<slug>.html` in the
[`focalstudio.github.io`](https://github.com/focalstudio/focalstudio.github.io) repo root.
GitHub Pages serves it from `main`. Merge the PR, then point Play's account-deletion URL at the
page's `#delete` anchor.

- Tick **dry run** to see the diff against the live page without opening a PR.
- The workflow **opens a PR and stops**. It never commits to the Pages repo directly and never
  merges — read the diff before merging.
- It no-ops (green, with a message saying which) when the org has no cross-repo credentials,
  when this repo has no `privacy.config.json`, or when the live page already matches.
- Re-running updates the same PR rather than opening another; it pushes one stable
  `privacy/<slug>` branch.

Cross-repo writes need a credential the default `GITHUB_TOKEN` cannot provide — see
[`.claude/reference/cross-repo-token.md`](../.claude/reference/cross-repo-token.md) for the
GitHub App behind it and how to provision or rotate it.

> **Adopting this for an app that already has a live page.** If the live page was written by
> hand it is probably richer than anything the config currently generates — MealCart's is. Do a
> dry run first and read the diff. The PR body shouts when it removes more lines than it adds.
> Do not merge until `privacy.config.json` reproduces the content that would be dropped.

The manual fallback is unchanged: copy `store-listing/privacy-<slug>.html` into the Pages repo
and open the PR yourself.

> The generated page is **standalone-styled** (self-contained CSS from `privacy-shell.html`),
> matching `privacy-policy-template.html` and the published `privacy-<slug>.html` pages. It
> does not depend on the Pages site's stylesheet.

## Config reference

| Key | Meaning |
|-----|---------|
| `lang` | `<html lang>` value (default `en`). |
| `lastUpdated` | `"auto"` → current `Month YYYY`, or a literal string. |
| `dataModel` | `"backend"` (accounts + hosted sync) or `"local-first"` (on-device only). |
| `backendProvider` | Backend name, used when `dataModel` is `backend`. |
| `userContent` | Human phrase describing what the user creates. |
| `accountDetailsPurpose` *(optional)* | Overrides the "used to …" tail of the account-details line (default `sign you in and sync your data across devices`). Use for hybrid apps where the account is only for sign-in. |
| `whereDataLives` *(optional)* | Overrides the entire "Where Your Data Lives" paragraph. Use for hybrid models (e.g. account hosted, content on-device only). |
| `collectsAnalytics` / `collectsCrashReports` | Toggle those disclosure lines. |
| `analyticsOptOutPath` | In-app path to the analytics toggle. |
| `thirdParties[]` | `{ service, purpose, dataShared }` rows for the third-party table. |
| `permissions[]` | `{ name, purpose, platform }` — `platform` is `all` / `ios` / `android`. |
| `deletion` | `{ inApp, steps[], deletedImmediately[], retained[], emailFallback }`. |
| `childrenNotice` | Include the children's-privacy section. |

The `deletion.retained[]` list and its reasons **must match what deletion actually does**,
including anything kept — this is verified against the store Data-safety form during review.
