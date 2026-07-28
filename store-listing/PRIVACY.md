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
| `privacy-chrome.html` | Site-chrome wrapper (nav/footer/styles) matching focalstudio.github.io. Generator fills its `{{TOKENS}}`. |
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

Open a PR adding the generated `privacy-<slug>.html` to the `focalstudio.github.io` repo
root. GitHub Pages serves it from `main`. Point Play's account-deletion URL at the page's
`#delete` anchor. (A later Phase-2 workflow can open this PR automatically — see the repo
issues.)

## Config reference

| Key | Meaning |
|-----|---------|
| `lang` | `<html lang>` value (default `en`). |
| `assetVersion` | Cache-bust query for `styles.css` / `script.js` on the Pages site. |
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
