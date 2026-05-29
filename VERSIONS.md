# VERSIONS.md

Authoritative reference for all pinned dependency versions in this template.

**Keep this file current.** After any dependency update, update the tables below and add an entry to `CHANGELOG.md`. See the [upgrade checklist](#upgrade-checklist) before making changes.

---

## Core stack

Changes to any of these define a new SDK generation and require running `npx expo install --fix`.

| Package | Version | Notes |
|---|---|---|
| Expo SDK | `56.0.7` | Anchor for all first-party expo-* packages |
| React Native | `0.85.3` | Must match Expo SDK's expected RN version |
| React | `19.2.3` | Must match RN peer dep |
| expo-router | `~56.2.8` | File-based navigation |
| TypeScript | `~6.0.3` | |
| Node.js (CI) | `22` | Pinned in `.github/workflows/ci.yml` |

---

## All dependencies

### Production

| Package | Range in package.json |
|---|---|
| `expo` | `~56.0.7` |
| `expo-haptics` | `~56.0.3` |
| `expo-linking` | `~56.0.13` |
| `expo-notifications` | `~56.0.14` |
| `expo-router` | `~56.2.8` |
| `expo-splash-screen` | `~56.0.10` |
| `expo-status-bar` | `~56.0.4` |
| `expo-store-review` | `~56.0.0` |
| `expo-system-ui` | `~56.0.0` |
| `react` | `^19.2.3` |
| `react-native` | `^0.85.3` |
| `react-native-pager-view` | `^8.0.1` |
| `react-native-safe-area-context` | `~5.7.0` |
| `react-native-screens` | `^4.25.2` |
| `@react-native-async-storage/async-storage` | `^2.2.0` |
| `posthog-react-native` | `^3.3.5` |
| `react-native-svg` | `15.15.4` |
| `expo-constants` | `~56.0.16` |
| `zustand` | `^5.0.3` |

### Dev

| Package | Range in package.json |
|---|---|
| `typescript` | `~6.0.3` |
| `eslint` | `^9.0.0` |
| `eslint-config-expo` | `~56.0.4` |
| `jest` | `^29.7.0` |
| `jest-expo` | `~56.0.0` |
| `babel-jest` | `^29.7.0` |
| `@babel/core` | `^7.25.2` |
| `@react-native/jest-preset` | `^0.85.3` |
| `@testing-library/react-native` | `^13.1.0` |
| `@types/jest` | `^29.5.12` |
| `@types/react` | `~19.2.14` |
| `react-test-renderer` | `^19.2.3` |

---

## Upgrade checklist

Follow this order every time dependencies change:

1. **Use `expo install`, not `npm update`:**
   ```bash
   npx expo install --fix --legacy-peer-deps
   ```
   This resolves to Expo-validated versions, not arbitrary npm latest.

2. **Install manually only when `expo install` can't cover a package:**
   ```bash
   npm install <package>@<version> --legacy-peer-deps
   ```
   Always use `--legacy-peer-deps` — the `jest-expo` / `@react-native/jest-preset` peer conflict requires it.

3. **Verify nothing broke:**
   ```bash
   npm run type-check
   npm run lint
   npm test
   ```

4. **Update this file** — reflect the new versions in both tables above.

5. **Update `CHANGELOG.md`** under `## [Unreleased]`.

---

## Known compatibility notes

- **`--legacy-peer-deps` is always required** for install/ci in this repo. The `jest-expo` package has an unresolved peer conflict with `@react-native/jest-preset` that can't be resolved without it. All CI workflows already include this flag.
- **`react-native-pager-view`** jumped from 6.x to 8.x in the SDK 56.0.7 update. No API changes in `PagerView` usage, but if adding new props check the [v8 changelog](https://github.com/callstack/react-native-pager-view/releases).
- **TypeScript 6** no longer auto-includes `@types` packages — `tsconfig.json` must explicitly declare `"types": ["jest"]` for test files.
- **React Native 0.85** added `'unspecified'` to `ColorSchemeName`. `useTheme.ts` handles this by mapping any non-light/dark value to `'light'`.
