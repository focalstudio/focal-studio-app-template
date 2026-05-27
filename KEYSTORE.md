# Android Keystore — EAS Managed Credentials

This template uses **EAS Build** for all Android builds. EAS manages the Android keystore for you — there is no `android/` folder committed to the repo and no manual `keytool` or `jarsigner` steps.

---

## How EAS handles your keystore

When you run your first production Android build, EAS will:

1. Generate a new keystore automatically.
2. Store it securely in Expo's credentials service (encrypted at rest).
3. Sign every subsequent build with the same keystore automatically.

You never handle the keystore file directly unless you explicitly opt out of managed credentials.

---

## Running a production build

```bash
eas build --platform android --profile production
```

EAS will prompt you to confirm credentials on the first run. After that it is fully automatic.

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
