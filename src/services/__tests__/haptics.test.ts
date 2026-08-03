import * as Haptics from "expo-haptics";
import {
  hapticFail,
  hapticStart,
  hapticSuccess,
  hapticTap,
  hapticWarning,
} from "../haptics";

/**
 * Thin wrappers, but the mapping is the point: `Button`, `Toggle`, and
 * `SocialSignInButton` all call these by name, and swapping impact for
 * notification feedback (or Light for Heavy) is a silent, device-only
 * regression that no screen test would catch.
 *
 * `expo-haptics` is mocked in `jest.setup.js` — its native module is reached by
 * most screens transitively.
 */
const mockHaptics = jest.mocked(Haptics);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("impact feedback", () => {
  it.each([
    ["hapticTap", hapticTap, Haptics.ImpactFeedbackStyle.Light],
    ["hapticStart", hapticStart, Haptics.ImpactFeedbackStyle.Medium],
  ])("%s uses impact feedback", async (_name, fn, style) => {
    await fn();

    expect(mockHaptics.impactAsync).toHaveBeenCalledWith(style);
    expect(mockHaptics.notificationAsync).not.toHaveBeenCalled();
  });
});

describe("notification feedback", () => {
  it.each([
    ["hapticSuccess", hapticSuccess, Haptics.NotificationFeedbackType.Success],
    ["hapticFail", hapticFail, Haptics.NotificationFeedbackType.Error],
    ["hapticWarning", hapticWarning, Haptics.NotificationFeedbackType.Warning],
  ])("%s uses notification feedback", async (_name, fn, type) => {
    await fn();

    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith(type);
    expect(mockHaptics.impactAsync).not.toHaveBeenCalled();
  });
});

it("awaits the underlying call rather than firing and forgetting", async () => {
  let settled = false;
  mockHaptics.impactAsync.mockImplementation(
    () =>
      new Promise<void>((resolve) =>
        setImmediate(() => {
          settled = true;
          resolve();
        })
      )
  );

  await hapticTap();

  expect(settled).toBe(true);
});
