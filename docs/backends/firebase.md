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
| Sign in with Apple | ✅ * | ✅ |
| Sign in with Google | ✅ iOS only * | ✅ both platforms |
| Analytics, Crashlytics, Performance, FCM | ❌ | ✅ |
| EAS build cache | untouched | invalidated (~15 min full iOS rebuild) |
| Current version | `firebase` 12.x | `@react-native-firebase/*` 25.x |

\* **Those two ✅s cancel the "runs in Expo Go" row above them.** Both are supported on the JS SDK path ([section 4](#4-social-sign-in--apple-and-google-optional)), but the recipe installs `expo-apple-authentication` — a native module with a config plugin. The moment you add it, "runs in Expo Go" and "EAS build cache untouched" stop being true, and the JS SDK's remaining advantage over React Native Firebase is that it's less to configure. If Expo Go was your reason for picking this column, decide about social sign-in *now*, not after you've built on it.

Google is **iOS only** here, and that is a real limit rather than an omission: Android needs its own OAuth client keyed to the package name and the signing certificate's SHA-1, which differs between a local build, EAS, and Play App Signing. React Native Firebase with `@react-native-google-signin/google-signin` gives you a native account picker on both platforms with no browser hop. If you need Android Google sign-in, that is the moment to switch columns.

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

## 4. Social sign-in — Apple and Google (optional)

One script adds both, and that is deliberate: **App Store guideline 4.8** makes Sign in with Apple mandatory the moment your app offers any other third-party login, so shipping Google alone is a rejection.

```bash
bash scripts/add-social-auth.sh
```

The script takes no arguments — it detects Firebase from the adapter already in `src/services/auth/`. It installs `expo-apple-authentication`, `expo-crypto`, `expo-auth-session` and `expo-web-browser`, copies the social module to `src/services/auth/social.ts`, and composes it onto the provider in `src/services/auth/index.ts`:

```ts
export const authProvider: AuthProvider = { ...firebaseAuthProvider, ...socialAuth };
```

It does **not** touch the adapter or `app.json`. The rest is manual:

> [!warning]
> This adds a native module with a config plugin. **The app no longer runs in Expo Go** — build a dev client (`npx expo run:ios`). It also invalidates the EAS build cache, so your next build is a cold one. On this path that costs you the JS SDK's main advantage — see [Pick a path first](#pick-a-path-first).

### Apple

**1. `app.json`** — add the plugin and the entitlement:

```json
"plugins": ["expo-router", "expo-system-ui", "expo-apple-authentication"],
"ios": { "usesAppleSignIn": true }
```

Without `usesAppleSignIn` the build fails **App Store validation at upload time**, not at runtime — so you find out at the worst possible moment.

**2. Apple Developer** → Certificates, Identifiers & Profiles → Identifiers → your App ID → enable **Sign In with Apple**.

That is all the native iOS flow needs. A Services ID, a Key, and a Return URL are only for the web/Android flow, which this recipe doesn't ship. The entitlement change invalidates your provisioning profile — let EAS regenerate it, or re-sync in Xcode.

**3. Firebase Console** → Authentication → Sign-in method → **Apple** → Enable → Save.

Leave **Services ID**, **Apple team ID**, **Key ID** and **Private key** blank. Those exist for the web and Android OAuth flow. The native iOS flow verifies the identity token directly, and filling those fields in for an iOS-only app is a common way to break a setup that was working.

#### The nonce pairing — the one thing that costs people an afternoon

Supabase's `signInWithIdToken` takes the identity token and nothing else. Firebase's Apple credential requires a nonce, and **the two sides get different values derived from the same secret**:

| Party | Value it receives |
|---|---|
| `AppleAuthentication.signInAsync({ nonce })` | `SHA-256(rawNonce)`, lowercase hex |
| `new OAuthProvider("apple.com").credential({ rawNonce })` | the **raw** nonce, unhashed |

Apple embeds the hash it was given into the identity token's `nonce` claim. Firebase hashes the `rawNonce` you hand it and compares the two. Give either side the other's value and Firebase rejects the credential with `auth/invalid-credential` — a message that points nowhere near the cause.

`expo-crypto`'s `digestStringAsync` defaults to lowercase hex, which is the encoding Firebase hashes to. Asking for `CryptoEncoding.BASE64` fails the same opaque way.

#### What else the Apple module does for you

Apple hands back the user's name **only on the very first authorization**, ever, for that Apple ID and app pair — every later sign-in returns nulls, and reinstalling doesn't reset it. Firebase does not populate `displayName` from an Apple credential on its own, so without this the user record stays permanently nameless. The module writes it via `updateProfile` immediately, because there is no second chance.

The decision of *what* to write lives in `appleNameToPersist` (`src/services/auth/appleName.ts`), which is unit-tested — social modules are copied out of `templates/`, which CI cannot type-check or lint, so the part that must be right lives where the test run can see it.

### Google

> [!important]
> **iOS only on this path.** The module refuses on Android with a clear message rather than failing opaquely. See [Pick a path first](#pick-a-path-first) for why, and what to do if you need Android.

**4. Firebase Console** → Authentication → Sign-in method → **Google** → Enable.

**5. Firebase Console** → Project settings → Your apps → **Add app → iOS**, using the `bundleIdentifier` from `app.json`.

Do not skip this. Without an iOS app registered, Firebase has no OAuth client whose audience matches your bundle ID, and it rejects the token with `auth/invalid-credential` — an error that points nowhere near the cause. Adding the iOS app is also what *creates* the iOS OAuth client you need in the next step.

**6. `.env.local`** — the iOS client ID from the app you just added:

```bash
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
```

The **Web** client ID is not used here. It's only needed if you later move to `@react-native-google-signin/google-signin`, which wants it as `webClientId`.

**7. `app.json`** — register the reversed client ID as a URL scheme, so the browser can hand control back:

```json
"ios": {
  "infoPlist": {
    "CFBundleURLTypes": [
      { "CFBundleURLSchemes": ["com.googleusercontent.apps.123456789-abcdef"] }
    ]
  }
}
```

Same ID, reversed. The module derives its redirect URI (`com.googleusercontent.apps.<id>:/oauthredirect` — one slash, not two) from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` at runtime, so this `app.json` entry is the one place the two values can drift apart. When they do, the browser opens and never returns.

#### Why not `signInWithPopup` / `signInWithRedirect`

Every Firebase web tutorial uses one of those two, and **neither works in React Native** — both need a `window` to navigate, and there is no shim. The supported route is to run the OAuth flow yourself and hand the resulting ID token to `signInWithCredential`.

Three constraints shape how the module does that:

| Constraint | Why |
|---|---|
| Authorization-code flow with **PKCE**, not implicit | Google refuses to issue an `id_token` directly to an installed app. |
| The **imperative** `new AuthSession.AuthRequest(...)` API | `expo-auth-session/providers/google` is a React *hook*. `social.ts` is a plain module the port calls as a function, so a hook is not available to it. |
| Redirect URI = reversed client ID | The only shape a Google **iOS** OAuth client accepts. |

The exchange then needs `code_verifier` passed explicitly in `extraParams` — omit it and Google returns `invalid_grant`.

---

## 5. Account deletion — do not skip this

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

## Fetching data

The template wires a `QueryClientProvider` in `app/_layout.tsx`. Keep Firestore calls in
hooks under `src/hooks/`, not in screens:

```ts
// src/hooks/useProfile.ts
import { useQuery } from "@tanstack/react-query";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useAuthStore } from "@/store/useAuthStore";

export function useProfile() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    // Scope the key by uid. Two accounts on one device must never share a
    // cache entry, even before the sign-out clear runs.
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const snap = await getDoc(doc(getFirestore(), "profiles", userId!));
      if (!snap.exists()) throw new Error("Profile not found");
      return snap.data();
    },
  });
}
```

The cache is cleared on sign-out and account deletion (`clearQueryCache()` in
`useAuthStore`), so the previous user's data can't be served to the next one.

For realtime (`onSnapshot`), prefer a `useEffect` subscription writing into
`queryClient.setQueryData` over a polling `useQuery` — and remember the unsubscribe.

## Gotchas

- **Apple returns the user's name once, ever.** `fullName` and a real `email` arrive only on the *first* authorization for that Apple ID and app pair. Reinstalling the app does not reset it — to test that path again you must revoke the app under Settings → Apple ID → Sign in with Apple.
- **Apple's private relay.** Users can hide behind `@privaterelay.appleid.com`. If you send them mail, configure the relay domain and sender in Apple's console, or it silently bounces.
- **Google sign-in is iOS-only on this path, and refuses loudly on Android.** Android needs an OAuth client keyed to the package name and the signing certificate's SHA-1 — and that fingerprint differs between a local build, EAS, and Play App Signing, so "it worked in debug" is the normal way to discover this. Rather than send the iOS client ID and get an opaque `redirect_uri_mismatch`, the module throws `not_wired` with an explanation. Android means React Native Firebase plus `@react-native-google-signin/google-signin`.
- **`auth/invalid-credential` on a Google sign-in almost always means no iOS app is registered** in the Firebase project, not a bad token. See [section 4](#google).
- **Crashlytics doesn't report native crashes under `expo-dev-client`** — the custom error overlay swallows them. Only release builds validate it.
- **`getReactNativePersistence` breaks under Webpack for web.** Branch on `Platform.OS` to `browserLocalPersistence` if you ship web.
- **RNFirebase `functions` requires the New Architecture.** This template has it enabled, so that's fine — but don't disable it.
- **Avoid `@react-native-firebase/*` 23.8.0–23.8.2** — a publishing regression left the Expo config plugin invalid.
