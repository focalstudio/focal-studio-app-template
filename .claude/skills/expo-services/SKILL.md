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
    supabase.ts
    revenuecat.ts
    posthog.ts
  store/             ← Zustand stores that consume services
    useAuthStore.ts
    usePaywallStore.ts
  utils/
    storage.ts       ← AsyncStorage helpers; ALWAYS use these
```

If `src/services/` does not exist, create it. Do not put SDK initialization in screens or `_layout.tsx`.

## The three layers

1. **Service file (`src/services/<provider>.ts`)**
   - Exports a singleton client + typed wrapper functions.
   - Reads config from `process.env.EXPO_PUBLIC_*` (client-readable) or via `expo-constants` for non-public.
   - Exposes a factory function `createXClient(opts)` so tests can stub it.

2. **Zustand store (`src/store/useXStore.ts`)**
   - Imports the service wrapper, never the raw SDK.
   - Holds state (`user`, `entitlements`, `isLoading`, etc.) and async actions (`login`, `restore`, `track`).
   - Persists relevant slices via the `storage` helpers (see below), **not** directly to AsyncStorage.
   - Every async action that touches state must `try/finally` to reset `isLoading` on every exit path.

3. **Component / screen**
   - Imports the store hook only. Never imports the service or the SDK.

## Storage helpers — non-negotiable

Always use [src/utils/storage.ts](../../../src/utils/storage.ts):

```ts
import { storage } from "@/utils/storage";

await storage.setJSON("auth/session", session);
const session = await storage.getJSON<Session>("auth/session", null);
```

Direct `AsyncStorage.getItem(...)` calls are a bug magnet — they return `string | null` and the project hit a null-handling bug (commit `825e87b`). The helpers handle JSON parse, defaults, and null-coalescing for you.

## Env-var conventions

| Prefix | Visibility | Use for |
|---|---|---|
| `EXPO_PUBLIC_*` | bundled into the client | API URLs, public anon keys, feature flags |
| (no prefix) | not bundled — read via `expo-constants` extra | server-only keys, never for the client |

Never commit `.env` files. Document every new var in `README.md` under "Environment variables".

## Cleanup contracts

Every subscription/timer/listener you create must have a paired teardown:

- Inside a component → `useEffect` cleanup.
- Inside a store → an explicit `reset()` action that components call on logout.
- For `expo-notifications` handlers, also unregister in `reset()` to avoid leaked handlers across user switches.

## Native-module risk callout

Adding any package with a config plugin (e.g. `expo-notifications`, `react-native-purchases`, `@react-native-firebase/*`):

- Invalidates the EAS build cache → next iOS build is full-rebuild (~15 min).
- Requires a config plugin entry in `app.json` under `expo.plugins`.
- Surface this in the report you hand back to the orchestrator — do **not** silently add a plugin to `app.json`.

## Provider-specific notes

### Supabase
- One client per app; export from `src/services/supabase.ts`.
- Auth session goes through the store, never read `supabase.auth.session()` from a screen.
- Use `onAuthStateChange` inside the store's `init()` action, register cleanup in `reset()`.

### RevenueCat
- See existing placeholder calls in [app/paywall.tsx](../../../app/paywall.tsx) and [src/store/usePaywallStore.ts](../../../src/store/usePaywallStore.ts) — replace those instead of duplicating.
- `Purchases.configure(...)` only once, at app startup (in a top-level `useEffect`, not on every store hydration).

### PostHog
- Initialize at app root with `PostHogProvider`.
- Use the existing focus-tracking pattern (`useFocusEffect` in screens) — don't add a new event taxonomy without alignment.

### expo-notifications
- Permission request goes in a dedicated onboarding step or settings toggle — never silently on app boot.
- Schedule cancellation **must** be paired with the original schedule (release v0.0.x had a regression here — see CHANGELOG).
