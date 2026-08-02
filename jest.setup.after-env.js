/* global jest, afterEach */

/**
 * Per-test lifecycle, applied after the test framework is installed.
 *
 * Note what is *not* here: React Native Testing Library v13 registers its own
 * matchers and auto-cleanup the moment it is imported
 * (`@testing-library/react-native/build/index.js`), so there is no
 * `extend-expect` to wire up. This file exists for state that leaks between
 * tests, which RTL does not own.
 */

afterEach(() => {
  /**
   * `renderRouter` calls `jest.useFakeTimers()` unconditionally and never
   * restores them (see `expo-router/build/testing-library/index.js`). Without
   * this, one screen test silently switches every later test in the same file
   * onto fake timers, and anything awaiting a real timeout hangs until Jest's
   * own timeout kills it.
   */
  jest.useRealTimers();
});
