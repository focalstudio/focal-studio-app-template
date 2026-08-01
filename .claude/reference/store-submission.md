# Store submission checklists

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file before every App Store or Play Store submission. The
> [`parallel-release`](../skills/parallel-release/SKILL.md) skill is the surrounding procedure.

## Apple App Store checklist
After `release/x.x.x` is merged to `main` and CI is green:

1. `git checkout main && git pull`
2. Run `eas build --platform ios --profile production` (or trigger via GitHub).
3. Monitor the build in the [Expo dashboard](https://expo.dev).
4. When the build completes, download the `.ipa` and upload via Xcode Organizer or `eas submit`.
5. In App Store Connect: select the new build, add release notes (match CHANGELOG), submit for review.
6. Verify dev mode is off: tap the app title 5× — confirm no dev badge appears.
7. **Data safety check** (see below) — the App Privacy answers must match what the app actually does.

## Google Play checklist
`android-release.yml` builds and submits automatically as part of the same `release.yml` run (see above) — this checklist is what's left to do by hand:

1. Confirm the CI run succeeded: check the **Android Release** workflow in GitHub Actions.
2. In Play Console → your app → **Internal testing**: confirm the new build appears as a draft release (`releaseStatus: "draft"` in `eas.json` — this is deliberate so nothing auto-promotes before review).
3. Add release notes (match CHANGELOG) and review the release.
4. Roll out to Internal testing, verify on a real device, then promote through Closed/Open/Production tracks per your own rollout policy — this template does not automate promotion beyond the internal track.
5. Verify dev mode is off on the installed build.
6. **Data safety check** (see below) — Play rejects submissions whose Data safety answers don't match observed behaviour.

## Data safety checklist (both stores)

Run this before every store submission. All three items ship with the template but each
one has to actually work in the built app, not just exist in the source:

- [ ] **Account deletion works end-to-end.** Settings → Danger Zone → Delete Account, on a
      real build against the production backend. Confirm the account is genuinely gone —
      not just signed out. `useAuthStore.deleteAccount()` must throw on a failed backend
      call so the UI surfaces the error rather than faking success.
- [ ] **Analytics opt-out survives a cold start.** Toggle Analytics off, force-quit,
      relaunch, and confirm no events are sent before touching the toggle again. The
      preference is re-applied during `useAppStore.hydrate()` — verify it, don't assume it.
- [ ] **Privacy policy URL resolves.** `curl -I` the URL in `src/constants.ts` and expect
      200. It must be app-specific and its deletion section must match what deletion
      actually does, **including anything retained**. Point Play's account-deletion URL at
      the page's `#delete` anchor. Generate the page from the app's data practices with
      `node scripts/gen-privacy-policy.mjs` (driven by `store-listing/privacy.config.json`)
      and publish it to the `focalstudio.github.io` Pages repo as `privacy-<app-slug>.html` —
      one page **per app**, never a shared policy. See [store-listing/PRIVACY.md](../store-listing/PRIVACY.md).
      The `verify-privacy.yml` workflow automates both checks (generate + live-URL `#delete`).
- [ ] **`store-listing/*.md` URLs match `src/constants.ts`.** These drift easily; a stale
      URL in the listing files is a common rejection cause.

First-ever Android release for a newly bootstrapped app additionally needs the one-time setup in [KEYSTORE.md](../KEYSTORE.md) (keystore generation, Play Console app entry, service account) run **before** any tag push, since CI cannot generate a keystore non-interactively.
