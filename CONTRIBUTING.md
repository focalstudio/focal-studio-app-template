# Contributing to [APP_NAME]

---

## Web development

```bash
git clone https://github.com/[GITHUB_REPO].git
cd [APP_SLUG]
npm install
npm run dev
```

Dev server: [http://localhost:5173](http://localhost:5173)

---

## Android development

**Prerequisites:** Java 21 + Android SDK — install [Android Studio](https://developer.android.com/studio) to get both.

```bash
npm install
npm run build
npx cap sync   # Android syncs successfully; iOS will warn if @capacitor/ios is absent — ignore it
```

**Option A — Android Studio (recommended)**

Open the `android/` folder in Android Studio and run the app.

**Option B — Command line**

```bash
chmod +x android/gradlew
cd android && ./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

> **Important:** Every time you change web source files, re-run `npm run build` then `npx cap sync` (as separate commands) before rebuilding. Do not chain with `&&` — `cap sync` exits non-zero when iOS is not set up, which stops the chain even though Android synced successfully.

**Deploy to a physical device**

```bash
# List connected devices
adb devices

# Install (single device connected)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Install (multiple devices — target by ID)
adb -s <DEVICE_ID> install -r android/app/build/outputs/apk/debug/app-debug.apk
```

**Full build + install (project root)**

```bash
npm run build
npx cap sync
cd android && ./gradlew assembleDebug && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

**Stale UI after reinstall (WebView cache)**

If the app shows old UI after reinstall, the WebView cache is stale. Fix:

```bash
adb -s <DEVICE_ID> shell am force-stop [APP_ID]
adb -s <DEVICE_ID> shell "run-as [APP_ID] rm -rf \
  /data/data/[APP_ID]/cache/ \
  /data/data/[APP_ID]/app_webview/"
```

---

## iOS development

**Prerequisites:** Xcode (macOS only) + iOS SDK.

```bash
npx cap add ios   # (only needed once, after template setup)
npm run build
npx cap sync ios
```

Open the iOS project in Xcode:

```bash
npx cap open ios
```

---

## Developer mode

Tap the app header title **5 times rapidly** to toggle dev mode on/off.

When active:
- A red **DEV** badge appears in the top-right corner
- Tap the badge to open the dev tools panel (Sentry test, version info)

Dev mode persists across restarts (stored in `localStorage`, scoped to `APP_VERSION`). It resets automatically on every version bump — safe for store submissions.

---

## Image normalization

To pad any PNG to 1024×1024 (transparent background, centered):

```bash
node scripts/normalize-image.js <path/to/source.png> [dest-path] [output-filename]
```

Examples:

```bash
# Write to public/ with inferred filename
node scripts/normalize-image.js ~/Downloads/icon.png

# Write to specific location
node scripts/normalize-image.js ~/Downloads/icon.png public/icon.png
```

Requires `sharp` — run `npm install` once if not already done.

---

## Running tests

```bash
npm test
```

Tests live in `src/__tests__/`. Add or update tests when changing `helpers.ts`, `storage.ts`, or any core logic.

---

## Code style

- **TypeScript** — strict mode enabled; avoid `any`
- **ESLint** — run `npm run lint` before pushing; fix all reported issues
- **No dead code** — remove unused imports and variables

---

## Branch naming

| Type | Pattern | Example |
|------|---------|---------|
| New feature | `feat/<description>` | `feat/onboarding-screen` |
| Bug fix | `fix/<description>` | `fix/notification-timing` |
| Chore / tooling | `chore/<description>` | `chore/update-deps` |
| Refactor | `refactor/<description>` | `refactor/storage-layer` |
| Docs | `docs/<description>` | `docs/contributing` |

---

## Submitting a pull request

1. Branch off `dev`
2. Make focused, atomic commits
3. Run `npm test` and `npm run lint` — both must pass
4. Open a PR against `dev` (not `main`)
5. Include a clear title and short description of *why* the change is needed

---

## Reporting bugs

Open a GitHub issue at `https://github.com/[GITHUB_REPO]/issues` and include:
- Steps to reproduce
- Expected vs. actual behaviour
- Platform (Web / Android / iOS) and OS version
- Screenshots or console logs
