# Testing

`npm test` runs Jest with the `jest-expo` preset. Two kinds of test live in this repo:

| Kind | Location | Renders anything? |
|---|---|---|
| Unit — stores, services, utils | `src/**/__tests__/*.ts` | No |
| Screen — a real route from `app/` | `src/__tests__/screens/*.tsx` | Yes, via `renderRouter` |

**The reference screen test is [`src/__tests__/screens/home-screen.test.tsx`](../src/__tests__/screens/home-screen.test.tsx).**
To test another screen, copy it and swap the import. You should not need to add a mock —
all seven screens in `app/` were verified to render against the harness as it stands.

---

## Adding a screen test

```tsx
import { renderRouter, screen } from "expo-router/testing-library";
import SettingsScreen from "../../../app/(tabs)/settings";

it("renders", async () => {
  renderRouter({ index: SettingsScreen }, { initialUrl: "/" });
  expect(await screen.findByText("Settings")).toBeOnTheScreen();
});
```

`renderRouter` mounts the **real** Expo Router around the **real** screen module, so
`useRouter`, `useFocusEffect`, `useLocalSearchParams`, and `<Link>` all work without a
per-hook stub. That is why it is preferred over RTL's bare `render`.

The first argument is an in-memory route map — `{ routeName: Component }`. Registering a
screen at `index` mounts it at `/` regardless of where it actually lives in `app/`, which
keeps a single-screen test from having to stand up its parent `_layout`. When the test is
*about* routing (route groups, `Stack.Protected` guards, redirects), register the real
paths instead and assert with `expect(screen).toHavePathname(...)`.

### Two things that will bite you

**1. Screen tests cannot be colocated in `app/`.**
Expo Router turns every file under `app/` into a route. Its `require.context` filter
(`node_modules/expo-router/_ctx.ios.js`) excludes only `+api`, `+html`, and `+middleware`
— **not** `__tests__` or `.test.tsx`. A test file placed under `app/` ships as a live
route in the production bundle. Screen tests live in `src/__tests__/screens/` and reach
up into `app/`.

**2. `renderRouter` switches on fake timers and never switches them off.**
It calls `jest.useFakeTimers()` unconditionally
(`expo-router/build/testing-library/index.js`). `jest.setup.after-env.js` restores real
timers after every test, so this only matters if you remove that hook.

---

## What the harness provides

### `jest.setup.js` — module mocks

Only native dependencies are mocked. Everything else runs for real.

| Mock | Why |
|---|---|
| `@react-native-async-storage/async-storage` | The library's own mock. Every store persists through it. |
| `react-native-safe-area-context` | The library's own mock. `src/components/layout/Screen.tsx` wraps **every** screen in `SafeAreaView`, so without this nothing renders. Spreads `requireActual`, so only the metrics are faked (320×640 frame, zero insets). |
| `expo-haptics` | Reached from `src/services/haptics.ts` by `Button`, `Toggle`, `SocialSignInButton`. |
| `expo-notifications` | `useTheme()` → `useAppStore` imports it, so every screen pulls it in. Loads unmocked, but prints a multi-line Expo Go warning on every render. |
| `posthog-react-native` | Same import path as above. Keeps the SDK's timers and network client out of the test process. |
| `expo-store-review` | `src/services/ratingService.ts`, reached from settings. `isAvailableAsync` resolves `false` so no test trips the real prompt. |
| `expo-status-bar` | `app/_layout.tsx` renders `<StatusBar>` unconditionally. Harmless in a single-screen test that never mounts the real root layout, but mounting the real layout with a `Stack.Protected`-guarded `Tabs` navigator active (any test of the auth/onboarding routing guards) makes the real component loop on every render — a synchronous loop severe enough that Jest's own `testTimeout` never gets a chance to fire. See `src/__tests__/screens/auth-guards.test.tsx`. |

Deliberately **not** mocked: `expo-router` (the point of `renderRouter` is to run it for
real), `react-native-svg`, `react-native-pager-view`, and `lucide-react-native` — all
verified to render fine under Jest.

### `jest.setup.after-env.js` — per-test lifecycle

Just the fake-timer restoration described above. RTL v13 registers its own matchers and
auto-cleanup on import, so there is no `extend-expect` to wire up.

### `types/expo-router-testing-library.d.ts`

Expo Router registers `toHavePathname`, `toHaveSegments`, `toHaveSearchParams`, and
friends at runtime but ships an empty `expect.d.ts`. Without this declaration file those
matchers work under `npm test` and fail `npm run type-check`. Keep it in sync if
`expo-router` is upgraded.

### What `jest-expo` already handles — do not re-add

The Jest block in `package.json` is deliberately four lines. The preset already supplies:

- **`moduleNameMapper` for the `@/` alias.** `jest-expo` reads `tsconfig.json`'s `paths`
  and generates the mapping (`withTypescriptMapping`). Confirm with `npx jest --showConfig`.
- **`transformIgnorePatterns`.** The preset ships an allowlist covering `react-native*`,
  `expo*`, and `@react-navigation`.
- **Expo NativeModules stubs** and the asset-file transformer.

Overriding either of the first two by hand silently drops the rest of the preset's work.

---

## Resetting state between tests

Zustand stores are module singletons shared by every test in a file. Reset them yourself
in `beforeEach` — there is no global reset, because unit tests that never touch a store
should not pay to import all four:

```ts
const initialState = useAppStore.getState();
beforeEach(async () => {
  await AsyncStorage.clear();
  useAppStore.setState(initialState, true);
});
```

## Faking the auth provider

When a screen test needs to control sign-in (login, signup, settings), reuse the pattern
in [`src/store/__tests__/useAuthStore.test.ts`](../src/store/__tests__/useAuthStore.test.ts#L35-L76)
rather than inventing a second convention. Its three load-bearing details:

1. **The mock provider's identity must stay stable.** `useAuthStore` captures
   `authProvider` once at module load and Jest evaluates a mock factory once, so returning
   a fresh object per test leaves the store holding the original. Tests mutate a
   module-level `mockProvider` in place.
2. **`resetProvider()` wipes in place** (`delete` each key, then `Object.assign`) so one
   test's stubs cannot leak into the next.
3. **The `jest.mock` spreads the real `types` and `authErrorMessage`.** The store branches
   on `instanceof AuthError`; a stubbed error class would make cancellation tests pass for
   the wrong reason.

---

## Other checks

```bash
npm test           # Jest
npm run type-check # TypeScript — tsconfig already declares "types": ["jest"]
npm run lint       # ESLint
```
