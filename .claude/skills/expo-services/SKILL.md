---
name: expo-services
description: Template-specific integration patterns for third-party services in this Expo + React Native iOS app template. Use when wiring Supabase, RevenueCat, PostHog, expo-notifications, or any external SDK into the codebase. Covers where SDKs initialize, how Zustand stores consume them, env-var conventions, and persistence via the project storage helpers.
---

# Expo services integration patterns

This skill encodes the conventions this specific template expects when adding third-party services. Follow it instead of generic SDK quickstarts — the quickstarts skip the store/persistence layer this template enforces.

## Directory layout

```
src/
  services/          ← thin SDK wrappers, one file per provider
    analytics.ts     ← PostHog (the only live third-party SDK today)
    notifications.ts
    haptics.ts
    ratingService.ts
    auth/            ← the AuthProvider port (types, local, index) + adapters
    paywall/         ← the PaywallProvider port (types, local, index) + adapters
  store/             ← Zustand stores that consume services
    useAuthStore.ts
    usePaywallStore.ts
  utils/
    storage.ts       ← AsyncStorage helpers; ALWAYS use these
```

All of the above exists today; anything else you need, create. Do not put SDK initialization in screens or `_layout.tsx`.

## The three layers

1. **Service file (`src/services/<provider>.ts`)**
   - Exports a singleton client + typed wrapper functions.
   - Reads config from `process.env.EXPO_PUBLIC_*` (client-readable) or via `expo-constants` for non-public.
   - Exposes a factory function `createXClient(opts)` so tests can stub it.

2. **Zustand store (`src/store/useXStore.ts`)**
   - Imports the service wrapper, never the raw SDK.
   - Holds state (`user`, `entitlements`, `isLoading`, etc.) and async actions (`signIn`, `restore`, `track`).
   - Persists relevant slices via the storage helpers (see below), **not** directly to AsyncStorage.
   - Every async action that touches state must `try/finally` to reset `isLoading` on every exit path.

   Stores in this repo are plain `create()` — **no `zustand/middleware` persist**. They hand-roll persistence in a fixed shape, and a new store must match it:

   | Member | Contract |
   |---|---|
   | `isLoading` | starts `true`; only `hydrate()` flips it to `false` |
   | `hydrate()` | `async`, reads storage, validates the shape, sets state. Called once from [app/_layout.tsx](../../../app/_layout.tsx), which holds the splash screen until every store's `hydrate()` settles |
   | setters | `set({...})` then fire-and-forget the write — do not `await` inside a sync setter |
   | `init()` | **only** for stores that own a live SDK subscription. Returns its unsubscribe (see below) |

   Validate anything you read back from storage. A persisted blob is untrusted input — it can be malformed by a partial write or an older app version. See the `isValidUser` type guard in [src/store/useAuthStore.ts](../../../src/store/useAuthStore.ts).

3. **Component / screen**
   - Imports the store hook only. Never imports the service or the SDK.

## Storage helpers — non-negotiable

Always use [src/utils/storage.ts](../../../src/utils/storage.ts). It exports **named functions**, not a `storage` object:

```ts
import { loadJson, saveJson, removeItem } from "../utils/storage";

await saveJson(`${STORAGE_PREFIX}auth_session`, session);
const session = await loadJson<Session | null>(`${STORAGE_PREFIX}auth_session`, null);
await removeItem(`${STORAGE_PREFIX}auth_session`);
```

Full surface: `loadJson` / `saveJson` / `loadString` / `saveString` / `loadNumber` / `saveNumber` / `removeItem`. Every one takes an explicit fallback and swallows its own errors — reads never throw, writes are fire-and-forget.

Two conventions the existing stores follow:

- **Prefix every key with `STORAGE_PREFIX`** from [src/constants.ts](../../../src/constants.ts), so one device can hold several apps built from this template without collisions.
- **Relative imports** (`../utils/storage`). The `@/*` → `./src/*` alias exists in `tsconfig.json`, but no store uses it; match the surrounding code.

Direct `AsyncStorage.getItem(...)` calls are a bug magnet — they return `string | null` and the project hit a null-handling bug in `loadNumber` (commit `825e87b`). The helpers handle JSON parse, defaults, and null-coalescing for you.

## Env-var conventions

| Prefix | Visibility | Use for |
|---|---|---|
| `EXPO_PUBLIC_*` | bundled into the client | API URLs, public anon keys, feature flags |
| (no prefix) | not bundled — read via `expo-constants` extra | server-only keys, never for the client |

**Adding a variable is a three-file change. All three are required:**

1. **[env.js](../../../env.js)** — add it to the Zod schema. This runs at build time via `app.config.js`, so a missing or malformed value fails the build instead of surfacing as `undefined` on a user's device. If a provider needs it, add it to that provider's branch in the `superRefine` so it is required only when that backend is selected.
2. **[.env.example](../../../.env.example)** — document it, commented out if optional.
3. **[README.md](../../../README.md)** — add a row to the Environment variables table.

**Read it back through [src/env.ts](../../../src/env.ts), never `process.env` directly:**

```ts
import { env, requireEnv } from "@/env";

env.EXPO_PUBLIC_POSTHOG_KEY             // string | undefined, already validated
requireEnv("EXPO_PUBLIC_SUPABASE_URL")  // throws rather than yielding undefined
```

`process.env` bypasses validation entirely, so a typo silently yields `undefined` — exactly what the schema exists to catch.

Never commit `.env` files.

## Cleanup contracts

Every subscription/timer/listener you create must have a paired teardown:

- Inside a component → `useEffect` cleanup.
- Inside a store → an `init()` action that **returns its own unsubscribe function**.
- For `expo-notifications` handlers, also unregister on teardown to avoid leaked handlers across user switches.

**Where an SDK auth listener goes — one answer, no exceptions.** A provider's `onAuthStateChange` subscription belongs in the store's `init()`, which returns the unsubscribe. `app/_layout.tsx` calls `init()` in a `useEffect` and returns that function as the effect cleanup:

```ts
// src/store/useAuthStore.ts
init: () => authProvider.subscribe((session) => set({ session, /* … */ })),

// app/_layout.tsx
useEffect(() => useAuthStore.getState().init(), []);
```

This keeps SDK access inside the service/store layers (rule 3 above) while the component owns the lifecycle. Do **not** subscribe from a screen, and do not subscribe at module scope — a Fast Refresh will stack duplicate listeners.

Note the split from `hydrate()`: `hydrate()` restores persisted state once at boot, `init()` opens a long-lived subscription. A store can need both.

## Native-module risk callout

Adding any package with a config plugin (e.g. `expo-notifications`, `react-native-purchases`, `@react-native-firebase/*`):

- Invalidates the EAS build cache → next iOS build is full-rebuild (~15 min).
- Requires a config plugin entry in `app.json` under `expo.plugins`.
- Surface this in the report you hand back to the orchestrator — do **not** silently add a plugin to `app.json`.

## Provider-specific notes

### Auth providers (Supabase / Firebase)

**Read this before writing any auth code.** Auth is not wired by hand in this template. It goes behind the `AuthProvider` port in [src/services/auth/types.ts](../../../src/services/auth/types.ts):

```
src/services/auth/
  types.ts     ← the AuthProvider port + AuthSession + AuthError. Read this first.
  local.ts     ← the no-backend scaffold. Throws `not_wired` for every remote call.
  messages.ts  ← AuthError code → user-facing string
  index.ts     ← `export const authProvider = localAuthProvider` — the ONE line to swap
```

**Supabase and Firebase are already written.** Do not hand-roll either one:

```bash
bash scripts/add-backend.sh supabase   # or: firebase
```

That installs the packages, copies the adapter from `templates/backends/<provider>/`, activates it, makes its env vars required in `env.js`, and prints the manual steps. Full guides: [docs/backends/supabase.md](../../../docs/backends/supabase.md), [docs/backends/firebase.md](../../../docs/backends/firebase.md).

For any **other** backend, write an adapter implementing `AuthProvider` and change that one line. Do not edit `useAuthStore` or any `(auth)` screen — they are already provider-agnostic, and editing them is how a template stops being reusable.

**Social sign-in (Apple + Google)** is opt-in on top of a wired backend: `bash scripts/add-social-auth.sh`. It takes no arguments — it detects Supabase or Firebase from the adapter in `src/services/auth/` and copies the matching `templates/social/<backend>-social.ts`. It composes `socialAuth` onto the provider by spread rather than editing the adapter, so adapter methods must never rely on `this`. It adds a native module — the app stops running in Expo Go and the EAS build cache is invalidated, so surface that, never add it silently. Both providers land together on purpose: App Store guideline 4.8 makes Apple mandatory as soon as Google is offered.

The two providers share nothing structurally. Apple is a native sheet returning an identity token; Google is a browser round-trip with a redirect URI, PKCE, and a callback to parse.

**Google, per backend:**

- **Supabase** — `signInWithOAuth({ provider: "google", skipBrowserRedirect: true })` + `expo-web-browser` + `expo-linking`. Client ID *and* secret live in the Supabase dashboard, so nothing enters the app and it works on both platforms. `skipBrowserRedirect` is mandatory: without it supabase-js tries to navigate a nonexistent `window.location`, yielding no navigation *and* no `data.url`.
- **Firebase JS SDK** — `signInWithPopup` / `signInWithRedirect` **do not work in React Native** (no `window`), which is what every Firebase tutorial uses. Needs `expo-auth-session` code+PKCE — Google rejects implicit `id_token` for installed apps — then `signInWithCredential`. Use the imperative `new AuthSession.AuthRequest(...)`; `expo-auth-session/providers/google` is a React *hook* and unusable from a plain module. **iOS only**: Android needs its own OAuth client and SHA-1, and the module throws `not_wired` there rather than failing opaquely.

**`parseOAuthCallback` and `googleReversedClientId` live in `src/services/auth/oauthCallback.ts`, not in `templates/`** — this repo's CI cannot import, type-check, or lint `templates/**`, so the parts most likely to be wrong (query vs fragment, PKCE vs implicit, the reversed URL scheme) sit where the test run covers them. Same rule as `appleName.ts`. Keep new pure logic there.

Three Firebase-specific facts, each the difference between working and a dead end:

- **The nonce pairing.** Supabase's `signInWithIdToken` needs only the identity token. Firebase's `OAuthProvider("apple.com").credential()` needs a nonce, and the two sides get *different* values from the same secret: Apple's sheet gets `SHA-256(raw)` as lowercase hex, Firebase gets the **raw** nonce and hashes it itself. Swap them and you get `auth/invalid-credential` with nothing pointing at the cause. Hence the extra `expo-crypto` dependency on this path (`digestStringAsync` defaults to hex — do not ask for base64).
- **`auth/invalid-credential` on Google means no iOS app is registered** in the Firebase project — its audience is your bundle ID, which Firebase won't recognise until you add the iOS app. That step also creates the iOS OAuth client `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` comes from.
- **`social.ts` imports `toAuthSession` / `toAuthError` from the adapter**, which is why `templates/backends/firebase/firebase.ts` exports them. An adapter copied from an older template lacks those exports; the script greps for them and refuses with the fix rather than patching the adapter.

Three contracts the port enforces, all load-bearing:

1. **Throw `AuthError` with a `code`**, never a raw provider error. Supabase and Firebase both surface internal database and JWT text; `messages.ts` maps codes to safe strings.
2. **`deleteAccount()` must throw on remote failure** and must not clear local state. Signing a user out while their account still exists is indistinguishable from a successful deletion — the exact failure Google Play's "Data safety" requirement targets. `signOut()` is the deliberate opposite: it clears locally even if the remote call fails, so a network error can't strand someone in a signed-in UI.
3. **`subscribe()` returns its own unsubscribe.** `useAuthStore.init()` wires it up; `app/_layout.tsx` owns the lifecycle.

Social sign-in (`signInWithApple` / `signInWithGoogle`) is **optional** on the port. A provider that omits them makes the UI say "not configured" instead of rendering a dead button.

The notes below are the parts that actually break in React Native. Generic SDK quickstarts omit most of them.

#### Supabase
- One client, exported from a single service module. Never read `supabase.auth.getSession()` from a screen — go through the store.
- `createClient` **must** pass an `auth` block. Without one the SDK defaults to browser `localStorage`, which doesn't exist in RN, and the session silently fails to persist — the single most common "why am I logged out on every launch" cause.
  - `storage`: `expo-sqlite/localStorage` (current Supabase + Expo recommendation). Avoid a raw `expo-secure-store` adapter — SecureStore caps values at **2048 bytes** and a Supabase session already exceeds it.
  - `detectSessionInUrl: false` — mandatory on native.
  - `persistSession: true`, `autoRefreshToken: true`.
- Import `react-native-url-polyfill/auto` at the top of the client file. RN still has no native `URL`; without it you get `URL.hostname is not implemented, js engine: hermes`.
- Register the `AppState` listener that drives `startAutoRefresh` / `stopAutoRefresh` **once, at module scope** — not in a component, or every mount stacks another listener. Skipping it means tokens expire while backgrounded and the first foreground request 401s.
- Env: `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). Older references say `ANON_KEY`.
- **RLS**: enable it on every table. Write policies as `(select auth.uid()) = user_id` — wrapping the call lets Postgres cache it as an initPlan, which is 94–99% faster than the bare form at scale. Always add `to authenticated`, and index every column a policy references.
- **Account deletion**: the client SDK cannot call `auth.admin.deleteUser`. Expose a `SECURITY DEFINER` RPC and let `on delete cascade` clean up. Afterwards call `signOut({ scope: 'local' })` — a plain `signOut()` throws `User from sub claim in JWT does not exist` once the user is gone, which looks like a failed delete.

#### Firebase
Two incompatible paths — pick deliberately, and see the recipe for the full comparison:

- **React Native Firebase 25.x** (recommended when you need Analytics, Crashlytics, or FCM): modular API only, the namespaced `firebase.auth().x()` style is gone. **Cannot run in Expo Go** — requires `expo-dev-client`. Needs plugin entries in `app.json` **plus** `expo-build-properties` with `useFrameworks: "static"` and `forceStaticLinking` naming every RNFB module. That last one is **mandatory on RN 0.84+ / SDK 54+**, which includes this template's SDK 56 — the iOS build fails without it.
- **Firebase JS SDK 12.x** (works in Expo Go, no native modules): you **must** use `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })`. Plain `initializeApp` + `getAuth` falls back to in-memory persistence and logs the user out on every cold start, silently. Note `getReactNativePersistence` is missing from the web typings (firebase-js-sdk #9316, still open) and needs a `@ts-expect-error`.
- Firebase's own `deleteUser()` rejects with `auth/requires-recent-login` if the session is stale. Reauthenticate and retry before surfacing the failure — but still throw if it ultimately fails, per the account-deletion contract in `useAuthStore`.
- `google-services.json` / `GoogleService-Info.plist` are gitignored — but **EAS only uploads git-tracked files**, so a build will fail or silently misconfigure. Supply them as EAS file-type env vars and reference the injected paths from `app.config.js`.
- Adding any RNFirebase module means a config plugin → see the native-module callout above. Surface it; never add one silently.

### RevenueCat
- **Do not wire `Purchases.*` into `usePaywallStore` or `app/paywall.tsx`.** The paywall sits behind the `PaywallProvider` port in `src/services/paywall/`, installed opt-in by `bash scripts/add-paywall.sh revenuecat`. Wiring the SDK into the store would put a native IAP dependency into every generated app, including the ones that never monetize.
- `Purchases.configure(...)` goes at **module scope** in the adapter, not in a `useEffect`. Same reasoning as the `AppState` listener in `templates/backends/supabase/supabase.ts`: a component-level registration re-runs on every mount and every Fast Refresh. (This line previously said the opposite — it was wrong.)
- Adapter code stays thin: no branch that isn't a null check on an SDK return value. Entitlement→tier mapping, package selection and error-code mapping all live in `src/services/paywall/`, because `templates/` gets no tsc, eslint or jest.
- Read the port contract before touching it — `getSubscription()` must never throw and never downgrade on doubt (the *inverse* of `AuthProvider.getSession()`), and `restore()` finding nothing is a success. Full guide: `docs/paywall/revenuecat.md`.

### PostHog
- Initialize at app root with `PostHogProvider`.
- Use the existing focus-tracking pattern (`useFocusEffect` in screens) — don't add a new event taxonomy without alignment.

### expo-notifications
- Permission request goes in a dedicated onboarding step or settings toggle — never silently on app boot.
- Schedule cancellation **must** be paired with the original schedule. An orphaned notification fires for a user who has signed out or deleted their account — cancel on both paths, not just sign-out.
