# Firebase backend

```bash
bash scripts/add-backend.sh firebase
```

That installs the **Firebase JS SDK** path. Read the next section before running it — Firebase on Expo is two genuinely different products and the choice is hard to reverse.

---

## Pick a path first

| | Firebase JS SDK (what the script installs) | React Native Firebase |
|---|---|---|
| Runs in Expo Go | ✅ | ❌ needs `expo-dev-client` |
| Config plugin / prebuild | none | required |
| Auth, Firestore, Storage | ✅ | ✅ |
| Analytics, Crashlytics, Performance, FCM | ❌ | ✅ |
| EAS build cache | untouched | invalidated (~15 min full iOS rebuild) |
| Current version | `firebase` 12.x | `@react-native-firebase/*` 25.x |

**The script installs the JS SDK** because it needs no native modules, no `app.json` edits, and doesn't invalidate the EAS cache — and this repo's rules forbid silently adding a config plugin. It covers auth, Firestore, and Storage, which is what most apps need.

**Migrate to React Native Firebase when you need Analytics, Crashlytics, or push (FCM)** — the JS SDK simply cannot do those on native. See [Migrating](#migrating-to-react-native-firebase) below.

> Dynamic Links were **removed entirely** in RNFirebase v23. If you were counting on them, pick something else.

---

## 1. Create the project

[console.firebase.google.com](https://console.firebase.google.com) → Add project.

Then **Add app → Web** (the `</>` icon). Yes, a Web app even though this is a mobile app — that's the JS SDK path.

## 2. Environment variables

Project settings → Your apps → SDK setup and configuration. Into `.env.local`:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<project>
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

The Firebase "API key" is not a secret — it identifies the project. **Security Rules are what protect your data**, exactly as RLS does for Supabase.

## 3. Enable sign-in

Authentication → Sign-in method → enable **Email/Password**.

## 4. Account deletion — do not skip this

`deleteUser()` removes the **auth user only**. Firestore documents and Storage objects survive, and answering Play's Data safety form as though data is deleted when it isn't is exactly the misrepresentation the requirement targets.

Add one of:

- the **Delete User Data** Firebase Extension (easiest), or
- a Cloud Function on `user().onDelete()` that clears the user's documents and files.

Then verify it actually runs before submitting.

---

## What the adapter does that quickstarts skip

**`initializeAuth` with explicit persistence, not `getAuth`:**

```ts
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
```

Plain `getAuth(app)` in React Native silently falls back to **in-memory persistence** — the user is signed out on every cold start, with nothing in the console. It is the single most-reported Firebase + Expo bug.

**`getReactNativePersistence` is missing from the published typings.** It exists in the RN bundle but not in the web `.d.ts` ([firebase-js-sdk #9316](https://github.com/firebase/firebase-js-sdk/issues/9316), open since v10). The adapter reads it off the namespace with a cast rather than `@ts-expect-error`, which would itself become an error the day upstream fixes the types.

**`getSession()` waits for the first auth callback.** Firebase restores the persisted user asynchronously, so `auth.currentUser` is still `null` right after startup. Reading it directly makes every cold start look signed-out for a frame, and the route guards bounce the user to login.

**`subscribe()` uses `onIdTokenChanged`, not `onAuthStateChanged`.** It fires on token refresh as well as sign-in/out, so the stored session's `accessToken` and `expiresAt` stay current instead of going stale after an hour.

**`auth/requires-recent-login`.** Firebase refuses to delete a user whose session is older than ~5 minutes. That maps to `requires_recent_login`, which the UI turns into "please sign in again" rather than a generic failure.

---

## Migrating to React Native Firebase

Only when you need Analytics, Crashlytics, or FCM.

```bash
npx expo install @react-native-firebase/app @react-native-firebase/auth expo-build-properties
```

`app.json`:

```json
{
  "expo": {
    "android": { "googleServicesFile": "./google-services.json" },
    "ios": { "googleServicesFile": "./GoogleService-Info.plist" },
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      ["expo-build-properties", {
        "ios": {
          "useFrameworks": "static",
          "forceStaticLinking": ["RNFBApp", "RNFBAuth"]
        }
      }]
    ]
  }
}
```

🔴 **`forceStaticLinking` is not optional on this template.** It supports React Native's prebuilt-core system introduced in RN 0.84 / Expo SDK 54. This template is on **SDK 56 / RN 0.85**, so you are squarely in the affected range and the iOS build fails without it. Every RNFirebase module you use must be listed.

Also: RNFirebase 22+ **removed the namespaced API**. Use modular calls (`getAuth(app)`, `signInWithEmailAndPassword(auth, …)`) — same shape as the JS SDK, so the adapter's structure carries over.

### google-services files and EAS

`google-services.json` and `GoogleService-Info.plist` are already gitignored. But **EAS only uploads git-tracked files**, so the build will warn and then misconfigure:

> File specified via `ios.googleServicesFile` is not checked in to your repository and won't be uploaded to the builder.

Supply them as **file-type EAS environment variables**:

```bash
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

then reference the injected path from `app.config.js`:

```js
android: { googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json" }
```

Two known traps: `eas build --local` reads secret-backed vars as `undefined`, and EAS has had issues passing secret files through to `prebuild`. The fallback is base64-encoding the file into a plain env var and materialising it in a pre-install hook.

---

## Gotchas

- **Crashlytics doesn't report native crashes under `expo-dev-client`** — the custom error overlay swallows them. Only release builds validate it.
- **`getReactNativePersistence` breaks under Webpack for web.** Branch on `Platform.OS` to `browserLocalPersistence` if you ship web.
- **RNFirebase `functions` requires the New Architecture.** This template has it enabled, so that's fine — but don't disable it.
- **Avoid `@react-native-firebase/*` 23.8.0–23.8.2** — a publishing regression left the Expo config plugin invalid.
