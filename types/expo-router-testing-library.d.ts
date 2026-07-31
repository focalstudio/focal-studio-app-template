/**
 * Type declarations for `expo-router/testing-library`'s custom Jest matchers.
 *
 * `expo-router` registers these at runtime via `expect.extend(...)` in
 * `build/testing-library/expect.js`, but ships an empty `expect.d.ts` — so
 * without this file `expect(screen).toHavePathname("/")` runs fine and fails
 * `npm run type-check`.
 *
 * Keep in sync with the matcher list in that file if Expo Router is upgraded.
 */

declare global {
  namespace jest {
    interface Matchers<R> {
      /** Asserts the current route's pathname, e.g. `"/settings"`. */
      toHavePathname(pathname: string): R;
      /** Asserts the pathname including its query string. */
      toHavePathnameWithParams(pathname: string): R;
      /** Asserts the route segments, e.g. `["(tabs)", "settings"]`. */
      toHaveSegments(segments: string[]): R;
      /** Asserts the current search params. */
      toHaveSearchParams(params: Record<string, string | string[]>): R;
      /** Asserts React Navigation's full state object. */
      toHaveRouterState(state: Record<string, unknown>): R;
    }
  }
}

export {};
