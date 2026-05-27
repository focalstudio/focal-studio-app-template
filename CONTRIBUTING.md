# Contributing to [APP_NAME]

---

## iOS development (primary)

**Prerequisites:** Xcode 15+ (macOS only) + Watchman (`brew install watchman`).

```bash
git clone https://github.com/[GITHUB_REPO].git
cd [APP_SLUG]
npm install
npx expo start --ios
```

The iOS Simulator opens automatically. Press `i` if it doesn't.

### Run on a physical iPhone

```bash
npx expo start
# Scan the QR code with the Expo Go app (iOS), or:
eas build --platform ios --profile development
# Install the dev client build on your device, then scan the QR code.
```

---

## Android development

**Prerequisites:** Java 21 + Android SDK — install [Android Studio](https://developer.android.com/studio).

```bash
npm install
npx expo start --android
```

To run on a physical device or build an APK:

```bash
eas build --platform android --profile preview
```

---

## EAS Build (iOS + Android)

```bash
eas login                                    # authenticate
eas build:configure                          # set up eas.json if needed

# Preview build (internal testing)
eas build --platform ios --profile preview

# Production build (App Store submission)
eas build --platform ios --profile production
```

Monitor builds at [expo.dev](https://expo.dev).

---

## Running tests

```bash
npm test           # Jest + React Native Testing Library
npm run type-check # TypeScript
npm run lint       # ESLint
```

Tests live in `src/__tests__/`. Add tests when changing `src/utils/` or `src/services/` core logic.

---

## Code style

- **TypeScript** — strict mode; avoid `any`
- **ESLint** — run `npm run lint` before pushing; fix all issues
- **No dead code** — remove unused imports and variables
- **No hardcoded values** — use `src/theme/` tokens and `src/constants.ts`

---

## Developer mode

Tap the app title **5 times rapidly** to toggle dev mode on/off. Dev mode state is scoped to `APP_VERSION` — it resets automatically on every version bump, making store submissions safe.

---

## Branch naming

| Type | Pattern | Example |
|------|---------|---------|
| New feature | `feat/<description>` | `feat/daily-checkin-screen` |
| Bug fix | `fix/<description>` | `fix/notification-scheduling` |
| Chore / tooling | `chore/<description>` | `chore/update-expo-sdk` |
| Refactor | `refactor/<description>` | `refactor/paywall-store` |
| Docs | `docs/<description>` | `docs/setup-guide` |

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
- Platform (iOS / Android) and OS version
- Screenshots or error logs
