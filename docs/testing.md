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
| `expo-sqlite/localStorage/install` | Only present once `add-backend.sh supabase` has run. The Supabase adapter imports it for its side effect (defining `localStorage`, which supabase-js uses as its storage adapter), and that side effect touches the native SQLite binding at import time. Mocked `virtual: true`, since the package is not a dependency of the template as shipped. |

`jest.setup.js` also seeds `process.env` with placeholder `EXPO_PUBLIC_*` values for every
backend, using `??=` so a real `.env.local` or CI value still wins. `src/env.ts` falls back to
`process.env` when there is no Expo manifest — always, under Jest — and a wired adapter calls
`requireEnv(...)` at module load, so without them every suite reaching `src/services/auth`
fails to start. The values are structurally valid and meaningless; nothing should reach a
network call with them.

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

### `jest.config.js` — why it isn't a `package.json` block

Config lives in `jest.config.js` because two values have to be **derived** from jest-expo's
rather than restated, and JSON cannot run code:

- **`transformIgnorePatterns`** — the preset expresses its allowlist as a single negative
  lookahead, `/node_modules/(?!(…))`. `firebase` and `@firebase` ship untranspiled ESM and
  must be spliced *inside* that group. Appending a pattern cannot work: the option is an OR
  of things to ignore, so extra entries only ever ignore more.
- **`transform`** — the preset transforms `\.[jt]sx?$`, which excludes `.mjs`.
  `@firebase/util` resolves to a real `.mjs`, so allowing it past the ignore patterns is only
  half the fix. The babel entry is looked up in the preset, not restated, so it keeps the
  preset's exact babel options.

Both derivations **throw at config load** if the preset's shape stops matching. An Expo SDK
bump is free to change it, and a silent no-op would restore the failure with no signal — it
only reproduces once a backend is wired.

### What `jest-expo` already handles — do not re-add

- **`moduleNameMapper` for the `@/` alias.** `jest-expo` reads `tsconfig.json`'s `paths`
  and generates the mapping (`withTypescriptMapping`). Confirm with `npx jest --showConfig`.
- **Expo NativeModules stubs** and the asset-file transformer.

Overriding these by hand silently drops the rest of the preset's work.

---

## Keeping the suite green once a backend is wired

`npm test` has to pass **after** `scripts/add-backend.sh`, not just in the template. That
script rewrites `authProvider` in `src/services/auth/index.ts`, so a wired app pulls a real
SDK into the import graph of every suite that touches auth — and `tsc` and `lint` both stay
green while Jest is red, because all three failure modes are load-time. See #100.

Two conventions follow:

1. **Never replace `src/env.ts` wholesale in a `jest.mock` factory.** Spread it and override
   only what the test drives:

   ```ts
   jest.mock("../../env", () => ({
     ...jest.requireActual("../../env"),
     isDevBuild: true,
     backend: "none",
   }));
   ```

   A factory returning a bare `{ isDevBuild, backend }` drops `requireEnv`, which a wired
   adapter calls at module load — the suite then dies with `requireEnv is not a function`.

2. **Build a `process.env` from `EVERY_BACKEND_CONFIGURED`**
   ([`src/__tests__/support/backendEnv.ts`](../src/__tests__/support/backendEnv.ts)), never
   from one backend's variables. `env.js` validates on require and promotes the selected
   backend's variables from optional to required, so a Supabase-only fixture is *correctly*
   rejected once Firebase is wired. `BACKEND_VARS[backend]` is there for the narrower case of
   asserting the minimal valid configuration.

   Files under `__tests__/support/` are excluded from `testMatch` by `testPathIgnorePatterns`
   — Jest would otherwise treat a fixture as a suite and fail it for having no tests.

The fence is the `Test` step in
[`template-backend-smoke-test.yml`](../.github/workflows/template-backend-smoke-test.yml),
which runs `npm test` in all four wired combinations. Before it existed, that workflow ran
only `tsc` and `lint`, which is exactly why #100 shipped.

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

## Two levels of mocking, and when each applies

Almost everything here fakes the **port** — `AuthProvider` — and never the SDK underneath
it. That is deliberate: a store or screen test cares that `signIn()` resolved or threw
`AuthError("invalid_credentials")`, not how supabase-js spelled it.

The exception is an **adapter contract test**, where the mapping *is* the thing under
test. Faking the port there would leave nothing to assert, so those mock the SDK directly
(`@supabase/supabase-js`, `firebase/auth`).

**Social sign-in tests sit between the two.** `templates/social/<backend>-social.test.ts`
mocks the *adapter* — `../supabase` / `../firebase` — because the subject is the composition
on top of the mapping, not the mapping itself. That is also what makes the port's "reuse the
adapter's `toAuthSession` / `toAuthError` rather than growing a second mapping" rule
assertable: with the adapter faked, a second inline mapping fails the test. The pure helpers
those modules call (`appleNameToPersist`, `parseOAuthCallback`, `googleReversedClientId`)
are deliberately left real — they already have unit coverage of their own, and faking them
would leave the composition untested.

| Level | Use for | Example |
|---|---|---|
| Port (`AuthProvider`) | stores, screens, anything above the adapter | [`useAuthStore.test.ts`](../src/store/__tests__/useAuthStore.test.ts) |
| Adapter | social sign-in modules composed onto an adapter | [`supabase-social.test.ts`](../templates/social/supabase-social.test.ts) |
| SDK | adapter contract tests only | [`supabase.test.ts`](../templates/backends/supabase/supabase.test.ts) |

### Tests in `templates/` run somewhere else

Two families of test live under `templates/`, and both work the same way:

| Test | Copied by | Destination |
|---|---|---|
| `templates/backends/<provider>/<provider>.test.ts` | `scripts/add-backend.sh` | `src/services/auth/__tests__/<provider>.test.ts` |
| `templates/social/<backend>-social.test.ts` | `scripts/add-social-auth.sh` | `src/services/auth/__tests__/social.test.ts` |

Each sits beside the module it exercises but is **written against its destination** —
`../<provider>`, `../social` and `../types` only resolve once the install script has copied
both files into `src/services/auth/`. Each script copies the test in the same step it
installs the module.

Four consequences worth knowing:

- `jest.config.js` lists `/templates/` in `testPathIgnorePatterns`, so the un-wired template
  never tries to run them against SDKs and native modules it deliberately does not install.
- No workflow change was needed to run them:
  [`template-backend-smoke-test.yml`](../.github/workflows/template-backend-smoke-test.yml)
  already runs `npm test` after the install scripts in all four jobs.
- Each copy **is** asserted, though. Both copies are guarded by `[ -f ]`, so renaming a file
  under `templates/` would skip one silently and leave `npm test` passing on a suite that no
  longer contains it. The smoke jobs check the destination file exists.
- **The generated app inherits them.** That is the point — the app's auth depends on this
  code, and it is the part of `templates/` that otherwise gets no CI checking at all (both
  `tsconfig.json` and `eslint.config.js` exclude `templates/**`, because those files cannot
  resolve until they are copied). Until they existed, nothing had ever type-checked, linted
  or executed these modules; writing them surfaced a real bug in the Supabase social module
  on the first pass.

These complement rather than duplicate
[`verify-backend.yml`](../.github/workflows/verify-backend.yml), which proves the *database*
contract against a real Postgres + GoTrue. The contract tests prove the *client* contract and
never touch a database.

---

## Coverage

```bash
npm run test:coverage
```

`jest.config.js` sets `collectCoverageFrom`, so a module no test imports counts as 0% rather
than vanishing from the report — without it the totals flatter the repo by several points.

`coverageThreshold` is a **ratchet, not a target**: the figures sit a few points under the
real ones so ordinary work has headroom while a regression fails the build. `ci.yml` passes
`--coverage`, which is what enforces them — without that flag Jest collects nothing and the
thresholds are inert.

`src/services/` carries its own floor on top of the global one. A single global number cannot
protect a layer: the service layer sat at 19% statements while the global average stayed in
the mid-70s, carried by well-tested screens and stores.

> When raising a threshold, re-derive it from a real run. Jest **subtracts** path-keyed files
> from the global pool, so the `global` block describes everything *except* `src/services/`
> and reads lower than the headline figure.

---

## End-to-end (Maestro)

Two flows in [`.maestro/`](../.maestro/) drive a real iOS Simulator:
`full-journey.yaml` (onboarding → paywall → tabs → account deletion) and `persistence.yaml`
(does what the app wrote survive a force-quit and read back through the zod schemas?).

Run them locally — it costs nothing and is far tighter than waiting on CI. Both flows pass in
**under a minute** on a warm simulator, against a build that takes ~10 minutes the first time.

### The seams the flows depend on

**Read this before you redesign a screen.** The flows address every element by `testID`, never by
its on-screen copy. Copy is the first thing your app replaces; these ids are the contract it has
to keep.

| id | Defined in | What it marks |
|---|---|---|
| `onboarding-slide-1` / `-2` / `-3` | `app/onboarding.tsx` — the `SLIDES` array | each slide's title, so the flow can prove a swipe advanced the pager |
| `onboarding-cta` | `app/onboarding.tsx` | the Next / Get Started button |
| `login-submit` | `app/(auth)/login.tsx` | "we are at the auth wall" — asserted on the way in *and* after account deletion |
| `dev-seed-session` | `src/components/dev/DevSeedSessionButton.tsx` | the dev-only seam that bypasses the auth wall (#79) |
| `tab-home` | `app/(tabs)/_layout.tsx` — `tabBarButtonTestID` | **"we are signed in and inside the app"** |
| `tab-settings` | same | navigates to Settings |
| `paywall-title` / `paywall-close` | `app/paywall.tsx` | the paywall arrived / dismiss it |
| `settings-title` | `app/(tabs)/settings.tsx` | Settings rendered |
| `settings-delete-account` | same | the Danger Zone row the two-step deletion starts from |
| `theme-light` / `theme-dark` / `theme-device` | same — the `THEMES` array | the appearance switches whose stored value `persistence.yaml` round-trips |

Two things follow from this that are easy to get wrong:

- **`tab-home` is the signed-in marker, not anything on the home screen.** The flows used to
  assert on the placeholder home card's `"Welcome"` title, in two places. Building a real app
  deleted that card on day one and broke both flows (#126). Rewrite the home screen freely.
- **Ids are written out as literal strings**, not built with a template literal — `testID:
  "theme-dark"` in the `THEMES` array rather than `` testID={`theme-${t.value}`} ``. That is so a
  grep for the id finds the file, which is exactly what the guard test below does.

**Three text selectors survive**, because nothing can give them a `testID`:

- `"Continue"` and `"Delete Account"` — buttons inside a native `Alert.alert`, which has no React
  Native tree to attach one to. Their copy lives in `handleDeleteAccount` in
  `app/(tabs)/settings.tsx`; **reword it there and you must update the flows in the same commit.**
- `"Open"` — iOS's own "Open in \<App\>?" scheme-handoff dialog. Not app copy at all.

For those three, Maestro's matching rule applies: a text selector is a regex that must match the
element's **whole** accessibility label, not a substring. `"Welcome to"` does not match
"Welcome to MyApp" — `"Welcome to.*"` does. All three above are exact labels on a native button,
so none needs a wildcard, and matching loosely would risk hitting the view behind the alert.

#### The guard test

[`src/__tests__/e2e-contract.test.ts`](../src/__tests__/e2e-contract.test.ts) reads every `id:`
selector out of `.maestro/*.yaml` and fails if it is not defined somewhere under `app/` or `src/`.
It also fails on any text selector outside the three exceptions above. It is static — no
rendering, no mocks — and `ci.yml` runs it on **every** branch, so a removed seam fails the PR
that removed it rather than an E2E run weeks later.

That gap is not hypothetical: E2E does not run on PRs to `dev` (see
[Opt-in E2E on a PR](#opt-in-e2e-on-a-pr)), and a `"Start Free Trial"` assertion sat dead in
`full-journey.yaml` for a whole release after the paywall stopped rendering that button.

If you genuinely need to move a seam, change both sides. The guard tells you when you have only
changed one.

### One-time setup

```bash
brew install openjdk@17                                  # Maestro is a JVM app
export PATH="$(brew --prefix openjdk@17)/bin:$PATH"      # keg-only — add to ~/.zshrc
MAESTRO_VERSION=2.8.0 \
  curl -fsSL https://get.maestro.mobile.dev | bash
```

> **Do not run `brew install maestro`.** Homebrew core's `maestro` is a cask for an unrelated
> product — *"Maestro (AI agent command center)"* from `runmaestro.ai`. The mobile-testing
> Maestro is mobile-dev-inc's, published only through the installer above or the
> `mobile-dev-inc/tap` tap. Prefer the installer: it honours `MAESTRO_VERSION`, so you get the
> version pinned in [`VERSIONS.md`](../VERSIONS.md) rather than whatever is latest. Note it
> appends PATH lines to `~/.zshrc` and `~/.bash_profile`.

Maestro needs **Java 17+ reachable either way**: its launcher uses `$JAVA_HOME/bin/java` when
`JAVA_HOME` is set, and otherwise falls back to `java` on `PATH`. `JAVA_HOME` is not required.
The `export PATH` line above is there because Homebrew's `openjdk@17` is *keg-only* — Homebrew
installs it but deliberately does not link it onto `PATH`, so without that line you have a JDK
installed and no `java` command.

> If you would rather set `JAVA_HOME`, point it at the real JDK home —
> `$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home`, not the formula prefix itself.
> And note that `/usr/libexec/java_home` will **not** find a Homebrew JDK: it only reports JDKs
> registered under `/Library/Java/JavaVirtualMachines/`, which a keg-only formula never touches
> (linking it there needs `sudo`, which this repo's permission model denies).

### Running

```bash
npx expo run:ios              # build + install once; leaves Metro in the foreground
npm run e2e                   # in a second terminal
npm run e2e -- .maestro/persistence.yaml     # or just one flow
```

`npm run e2e` runs [`scripts/e2e.sh`](../scripts/e2e.sh), which preflights the four things that
otherwise fail as a silent 60-second assertion timeout, then resolves `APP_ID` and `APP_SCHEME`
out of `app.json` the same way [`maestro-e2e.yml`](../.github/workflows/maestro-e2e.yml) does so
the two cannot drift. It refuses to run against an unbootstrapped template, where `app.json`
still holds its unreplaced template placeholders.

### Metro must be on port 8081

This is the one that will cost you an afternoon. A Debug build's `RCTBundleURLProvider` probes
`http://localhost:8081/status` and nothing else. **`RCT_METRO_PORT` is baked nowhere in the Expo
prebuild**, so `expo start --port N` and `expo run:ios --port N` change only which server the
*CLI* talks to — the installed app still looks for 8081. If anything else holds that port the app
comes up on the red *"No script URL provided"* screen with `unsanitizedScriptURLString = (null)`,
and every assertion times out against it.

Free the port if you can. If you cannot (a system process may hold it invisibly — `lsof` shows
nothing without `sudo`), point both the app and the preflight at the real port:

```bash
xcrun simctl spawn booted defaults write <bundle-id> RCT_jsLocation localhost:8083
E2E_METRO_PORT=8083 npm run e2e
```

That user default survives Maestro's `clearState: true`, so the flows still start from a clean
app state.

### When a flow fails

Screenshots and view hierarchies are written to `~/.maestro/tests/<run>` — read those first,
because a `tapOn` against an unmatched-but-present element reports COMPLETED while tapping
nothing. `commands.json` in that directory gives every step's status, which is the fastest way to
spot a step that "passed" without doing anything.

### In CI

Post-release via `workflow_call` from `release.yml`, on PRs to `main`, and on any PR labelled
`e2e` (see [Opt-in E2E on a PR](#opt-in-e2e-on-a-pr) below).

### Opt-in E2E on a PR

`maestro-e2e.yml` runs automatically on PRs targeting `main` — release PRs, where a pre-merge
gate is worth ~20 minutes of macOS runner. Routine PRs to `dev` skip it. To opt a risky feature
PR in, add the **`e2e`** label; the workflow re-triggers on `labeled`, so adding it to an
already-open PR works.

On this template repo the job checks out, installs, then hits the bootstrap gate and skips — the signal only becomes real in an app generated from it.

---

## Other checks

```bash
npm test            # Jest
npm run test:coverage # Jest + coverage thresholds (what CI enforces)
npm run type-check  # TypeScript — tsconfig already declares "types": ["jest", "node"]
npm run lint        # ESLint
```
