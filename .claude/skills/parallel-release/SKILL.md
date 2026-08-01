---
name: parallel-release
description: Ship a simultaneous iOS + Android release for this Expo template. One version tag drives two independent pipelines — Xcode Cloud (iOS) and EAS build+submit (Android, via android-release.yml). Covers the recurring release flow, the one-time Android bootstrap a newly created app must do before CI can ever succeed (keystore, Play Console app + gates, service account), what is automated vs manual, and end-to-end verification. Use whenever cutting a release, enabling Android for the first time, or debugging the release workflows.
---

# Parallel iOS + Android release

This template ships **two independent release pipelines** that a single `release/x.x.x`
branch and its `vX.Y.Z` tag drive at once:

| Platform | Build system | How it fires | Config it reads |
|---|---|---|---|
| **iOS** | **Xcode Cloud** (managed workflow) | Xcode Cloud workflow on push; also `eas build --platform ios` on demand | `app.json` / `app.config.js` + `ios/ci_scripts/ci_post_clone.sh` only — **not** `eas.json` or `.github/workflows/` |
| **Android** | **EAS Build + Submit** | `android-release.yml`, called by `release.yml` as a reusable workflow in the same run right after it creates the `vX.Y.Z` tag (or manual `workflow_dispatch` to rerun) | `eas.json`, `app.json` `android.*`, `.github/workflows/android-release.yml` |

Because the two systems read disjoint config, an Android/EAS change **cannot** affect an
iOS Xcode Cloud archive, and vice-versa. Keep it that way.

> **Do not** switch iOS to `eas build --platform all` or a single all-platform command in
> CI — a shared exit code lets an Android failure red the working iOS pipeline. The
> `eas-preview.yml` matrix uses `fail-fast: false` for exactly this reason.

---

## What is automated vs manual

| Step | iOS | Android |
|---|---|---|
| Version bump (`package.json` + `app.json`) | ✅ `scripts/bump-version.sh` | ✅ same script |
| Build number / versionCode | app-managed / Xcode Cloud | ✅ **EAS-owned** (`cli.appVersionSource: "remote"` auto-increments `versionCode`) |
| Tag `vX.Y.Z` + GitHub Release | ✅ `release.yml` on merge to `main` | ✅ same tag |
| Production build | Xcode Cloud (or `eas build -p ios`) | ✅ `android-release.yml` → `eas build -p android --profile production` |
| Upload to store | ⚠️ manual (`eas submit` / Xcode Organizer) | ✅ `android-release.yml` → `eas submit ... --latest` → Play **internal** track, `releaseStatus: draft` |
| Store review / rollout | ⚠️ manual (App Store Connect) | ⚠️ manual (Play Console: notes, review, promote past internal) |

The Android leg is the more automated of the two once the **one-time bootstrap** (below) is done.

---

## Part A — One-time Android bootstrap (first release of a newly created app)

**Do this once per app, before any tag push.** CI can neither generate the first keystore
nor accept a Play service-account key non-interactively, so a human runs it locally first.
Full command reference and troubleshooting live in [KEYSTORE.md](../../../KEYSTORE.md); this
is the ordered checklist plus the gotchas that bite in practice.

Run everything against the **real app**, not the template (the template has no real bundle id).

1. **Pre-flight**
   ```bash
   npx eas whoami            # logged into the correct Expo account/owner (matches app.json `owner`)
   npx eas --version
   ```
   Confirm the Play **developer account** has accepted the current Distribution Agreement and
   passed identity verification — this gates the first release independently of everything below.

2. **Play Console — create the app + clear the release gates** (browser)
   - Create the app for your `android.package` (e.g. `com.focalstudio.<app>`). ⚠️ **Package name
     is permanent once bound** — verify the spelling.
   - Complete the gates that block even an internal release: **privacy policy URL, App access,
     Ads declaration, Content rating, Target audience, Data safety**.
   - Create the **Internal testing** track with ≥1 tester.
   - The **display app name** (store listing) is editable anytime; only the package name is locked.

3. **Google Play service account** (browser)
   - **API access lives at the account level, not inside the app**, and Google hides it from the
     app nav. Go straight to **https://play.google.com/console/api-access** (only the account
     owner/admin can see it).
   - Link/create a Google Cloud project → enable the **Google Play Android Developer API** →
     create a **service account** → create a **JSON key** → download it.
   - In **Play Console → Users and permissions**, invite the service-account email and grant it
     access to the app. **If a granular grant (Release to testing tracks + View app information)
     still errors on submit, grant `Admin (all permissions)`** — granular permissions are flaky
     while the app is still a Draft. Then allow **~3–5 min for propagation**.
   - ⚠️ The JSON key never goes into git or a GitHub secret. Keep it in a secrets manager.

4. **Upload credentials to EAS** (interactive)
   ```bash
   eas credentials --platform android
   #  → production → Keystore → Set up a new keystore → Generate new keystore
   eas credentials --platform android
   #  → Google Service Account → Manage your Google Service Account Key for Play Store Submissions
   #    → Set up a new key → paste the path to the downloaded JSON
   ```
   (The keystore can also be auto-generated by the first interactive `eas build` — it prompts
   "Generate a new Android Keystore?" → Yes.)

5. **Prove the full path end-to-end** — this *is* the real verification; do it before trusting CI:
   ```bash
   eas build  --platform android --profile production
   eas submit --platform android --profile production --latest
   ```
   Success = the AAB lands in **Play Console → your app → Test and release → Internal testing**
   as a **draft**. `submit.production.android` in `eas.json` is `{ track: internal, releaseStatus:
   draft }` on purpose — nothing auto-promotes.

Common first-submit error: `The service account is missing the necessary permissions` → the
grant in step 3 is missing/insufficient or hasn't propagated. Fix the grant (Admin if needed),
wait a few minutes, re-run `eas submit` — no rebuild required.

---

## Part B — Recurring release (every version, both platforms)

Delegate the git mechanics to the **`release-manager`** agent (or follow
[.claude/CLAUDE.md](../../CLAUDE.md) → "Release workflow"). The sequence:

1. `release-manager` cuts `release/x.x.x` off `dev`, runs `bash scripts/bump-version.sh x.x.x`,
   moves the `CHANGELOG.md` Unreleased block to `## [x.x.x] — YYYY-MM-DD`, bumps `DEV_MODE_KEY`,
   pre-emptively reviews the diff, syncs with `main`, and opens **two** PRs: `release/x.x.x → main`
   and the `release/x.x.x → dev` backmerge.
2. Merge the `→ main` PR with **`gh pr merge NNN --merge`** — **never `--delete-branch`** (it
   auto-closes the backmerge PR).
3. On merge to `main`, **`release.yml`** reads the version, creates tag **`vX.Y.Z`**, and
   publishes a GitHub Release from the CHANGELOG section.
4. In that same `release.yml` run, right after the tag is created, an `android-release` job calls
   **`android-release.yml`** as a reusable workflow (`uses: ./.github/workflows/android-release.yml`,
   `secrets: inherit`) → EAS builds the AAB (versionCode auto-incremented) and submits it to the Play
   internal track as a draft.
5. **iOS** in parallel: the Xcode Cloud workflow archives from `main`; follow the **Apple App Store
   checklist** in `.claude/reference/store-submission.md` (build → App Store Connect → release notes → submit).
6. **Android** finish: follow the **Google Play checklist** — confirm the CI run, add release notes,
   review the draft, roll out through Internal → Closed/Open/Production per your rollout policy.

### No cross-workflow event to worry about
`android-release.yml` is a **reusable workflow** (`workflow_call`), not something waiting on a tag
push. `release.yml` invokes it directly (`uses: ./.github/workflows/android-release.yml`) as a job
in the same run, right after the `tag-and-release` job creates `vX.Y.Z` — so there's no dependency on
GitHub's tag-push event firing (it deliberately doesn't: tags pushed with the default `GITHUB_TOKEN`
never trigger other workflows, which is why the old tag-trigger design silently never ran). Nothing
to pre-smoke-test across workflow boundaries; the whole Android leg is self-contained inside the
Release run. `workflow_dispatch` remains as the manual rerun path (e.g. re-submitting after fixing
something in Play Console).

---

## Part C — Verification

- **Android CI green:** the **Android Release** workflow run for the tag is green; a new draft with
  the expected `versionCode` appears in Play Console → Internal testing.
- **iOS unregressed:** an Xcode Cloud archive still succeeds (it reads only `app.config.js` +
  `ios/ci_scripts/`, so an `eas.json`/workflow change should never touch it — verify once after any
  Android-pipeline change).
- **Preview matrix isolation:** `eas-preview.yml` runs its `[ios, android]` matrix on push to the
  branch it watches (**this template: `dev`**). Confirm both legs go green independently — killing the
  Android leg must not fail iOS (`fail-fast: false`). The Android leg needs the Part A credentials to
  build; on an un-bootstrapped app the `[APP_SLUG]` guard step no-ops it.
- **On device:** install the internal-track build and confirm notifications (Android channel setup
  in `src/services/notifications.ts` has never run in a real build until now), Reanimated/worklets,
  Lottie, and edge-to-edge layout.
- **Dev mode off:** tap the app title 5× — no dev badge (the version bump rotates `DEV_MODE_KEY`).

---

## Prerequisites checklist (assert before relying on CI)

- [ ] `EXPO_TOKEN` secret exists in the GitHub repo (the only secret the Android workflow needs).
- [ ] `cli.appVersionSource` is `"remote"` in `eas.json` (EAS owns `versionCode`).
- [ ] `eas.json` `submit.production.android` = `{ track: "internal", releaseStatus: "draft" }` and
      has **no** `serviceAccountKeyPath` (the key lives in EAS credentials).
- [ ] `app.json` `android.blockedPermissions` blocks only what the app truly doesn't use — do **not**
      blanket-block storage permissions (breaks `expo-image-picker` gallery on Android ≤12L).
- [ ] `android-release.yml` is `workflow_call` + `workflow_dispatch` only (no `push: tags:` trigger —
      that event never fires for GITHUB_TOKEN-pushed tags) and `release.yml`'s `android-release` job
      is gated on `needs.tag-and-release.outputs.tag_created == 'true'`.
- [ ] Part A completed for this app (keystore + service account in EAS credentials, one draft proven).
