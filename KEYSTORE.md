# Android Release Signing

## Generating a keystore

Run this command once per app (not per release):

```bash
keytool -genkeypair -v \
  -keystore android/[APP_SLUG]-release.jks \
  -alias [APP_SLUG] \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You'll be prompted for:
- Keystore password (save this securely — you can never recover it)
- Key password (can be the same as keystore password)
- Distinguished Name fields (CN, OU, O, etc.) — these are cosmetic only

After generation, verify it:

```bash
keytool -list -v \
  -keystore android/[APP_SLUG]-release.jks \
  -storepass "YOUR_KEYSTORE_PASSWORD"
```

Note the SHA-1 and SHA-256 fingerprints — you'll need them for the Play Console upload key.

---

## keystore.properties (never commit)

Create `android/keystore.properties` with:

```properties
storeFile=[APP_SLUG]-release.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=[APP_SLUG]
keyPassword=YOUR_KEY_PASSWORD
```

This file is excluded by `.gitignore`. **Back it up to a password manager immediately.**

---

## Git safety

`android/.gitignore` must exclude:

```
*.jks
*.keystore
keystore.properties
```

The root `.gitignore` already covers these. Double-check before any push to a public repo.

---

## build.gradle signing config

In `android/app/build.gradle`, load credentials from `keystore.properties`:

```groovy
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

---

## Building a signed release AAB

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## Version management

Increment `versionCode` by 1 and update `versionName` before every Google Play upload.

These live in `android/app/build.gradle`:

```groovy
versionCode 1
versionName "0.1.0"
```

Also update `APP_VERSION` in `src/App.tsx` and `version` in `package.json` to keep them in sync.

---

## GitHub Actions secrets

For CI-based release builds, store credentials as GitHub repository secrets:

| Secret | Value |
|--------|-------|
| `VITE_POSTHOG_KEY` | PostHog project API key |
| `VITE_SENTRY_DSN` | Sentry DSN |
| `KEYSTORE_BASE64` | `base64 android/[APP_SLUG]-release.jks` |
| `KEY_ALIAS` | `[APP_SLUG]` |
| `KEY_PASSWORD` | Your key password |
| `STORE_PASSWORD` | Your keystore password |
