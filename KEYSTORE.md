# Android Keystore — EAS Managed Credentials

This template uses **EAS Build** for all Android builds. EAS manages the Android keystore for you — there is no `android/` folder committed to the repo and no manual `keytool` or `jarsigner` steps.

---

## How EAS handles your keystore

When you run your first production Android build, EAS will:

1. Generate a new keystore automatically.
2. Store it securely in Expo's credentials service (encrypted at rest).
3. Sign every subsequent build with the same keystore automatically.

You never handle the keystore file directly unless you explicitly opt out of managed credentials.

> **CI cannot generate the first keystore.** `eas build --platform android --non-interactive` fails with `Generating a new Keystore is not supported in --non-interactive mode` if no keystore exists yet. The first Android build — for any newly bootstrapped app — must be run **interactively, from a local machine**, before `android-release.yml` or the Android leg of `eas-preview.yml` can succeed in CI. Same requirement applies to the Google Play service account key: upload it via `eas credentials` (below) before enabling `eas submit` in CI.

---

## One-time setup for a newly bootstrapped app (do this before CI)

```bash
# 1. Generate and store the keystore on EAS servers
eas credentials --platform android
#    -> production -> Keystore -> Set up a new keystore -> Generate new keystore

# 2. Upload the Google Play service account JSON (see Google Play submission below)
eas credentials --platform android
#    -> Google Service Account -> Manage your Google Service Account Key for Play Store submissions

# 3. Confirm both landed
eas credentials --platform android

# 4. Prove the full path works before trusting CI with it
eas build  --platform android --profile production
eas submit --platform android --profile production --latest
```

Only after step 4 succeeds should `android-release.yml` be allowed to run against a real tag.

---

## Google Play submission — app entry and service account

`eas submit` needs two things that only exist per-app, created once by a human:

1. **A Play Console app entry** for your package name — create it in the Play Console before any submit, and complete the Data safety / content rating / privacy policy / target audience gates that block even an internal-track release. The package name is permanent once bound.
2. **A Google Play service account** with app-scoped *Release to testing tracks* permission (Play Console → Setup → API access → link/create a GCP project → enable the Google Play Android Developer API → create a service account → download its JSON key → invite that email under Users and permissions). Upload the JSON via `eas credentials` as in step 2 above — never commit it, never put it in a GitHub secret and write it to disk in CI. `eas.json`'s `submit.production.android` only needs `track` and `releaseStatus`; it does not need a `serviceAccountKeyPath`.

---

## Running a production build

```bash
eas build --platform android --profile production
```

After the one-time setup above, this and `eas submit` also work non-interactively in CI (`android-release.yml`, triggered on `v*` tags).

---

## Inspecting or exporting your keystore

To view or download your managed keystore:

```bash
eas credentials
```

Select **Android → production** to see the key alias, SHA-1/SHA-256 fingerprints, and download options. You will need these fingerprints when registering your app with Google services (e.g. Firebase, Google Sign-In, Maps SDK).

---

## Bringing your own keystore

If you already have a keystore (e.g. migrating an existing app), you can upload it:

```bash
eas credentials
# Choose: Android → production → Set up a new keystore → I want to upload my own
```

EAS will store your keystore in its credentials service and use it for all future builds.

---

## Local builds (advanced)

If you run `eas build --local`, EAS will download the managed keystore to your machine for the duration of the build. You need the Java SDK (`keytool`) installed locally.

---

## Recovering credentials

If you need to move your app to a different Expo account or export credentials for backup:

```bash
eas credentials --platform android
# Choose: Download credentials
```

Store the downloaded `.jks` file and its password in a secure secrets manager (1Password, AWS Secrets Manager, etc.). **Never commit keystores or passwords to git.**

---

## Further reading

- [EAS Credentials docs](https://docs.expo.dev/app-signing/managed-credentials/)
- [Android app signing guide](https://docs.expo.dev/app-signing/local-credentials/)
- [Google Play signing requirements](https://support.google.com/googleplay/android-developer/answer/9842756)
