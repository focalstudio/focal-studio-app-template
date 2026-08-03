import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  checkNotificationPermission,
  requestNotificationPermission,
  rescheduleNotifications,
} from "../notifications";
import type { NotificationPrefs } from "../../types";

/**
 * `expo-notifications` is already mocked in `jest.setup.js` — every screen test
 * needs it, because `useTheme()` pulls `useAppStore` which imports this module
 * at load. These tests assert against that same mock rather than installing a
 * second one, so there is only ever one definition of what the SDK does under
 * test.
 *
 * Nothing here resets mocks globally (`jest.config.js` sets neither `clearMocks`
 * nor `resetMocks`), so clearing is this suite's own job.
 */
const mockNotifications = jest.mocked(Notifications);

const prefs = (overrides: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  dailyReminderEnabled: false,
  dailyReminderTime: "09:00",
  reengagementEnabled: false,
  reengagementTime: "19:00",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifications.requestPermissionsAsync.mockResolvedValue({
    status: "granted",
  } as never);
  mockNotifications.getPermissionsAsync.mockResolvedValue({
    status: "granted",
  } as never);
});

describe("permission helpers", () => {
  it.each([
    ["granted", true],
    ["denied", false],
    ["undetermined", false],
  ] as const)("requestNotificationPermission maps %s to %s", async (status, expected) => {
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status } as never);
    await expect(requestNotificationPermission()).resolves.toBe(expected);
  });

  it.each([
    ["granted", true],
    ["denied", false],
  ] as const)("checkNotificationPermission maps %s to %s", async (status, expected) => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status } as never);
    await expect(checkNotificationPermission()).resolves.toBe(expected);
  });

  it("checkNotificationPermission does not request anything", async () => {
    await checkNotificationPermission();
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("rescheduleNotifications", () => {
  it("cancels everything before scheduling, so repeat calls cannot stack duplicates", async () => {
    await rescheduleNotifications(prefs({ dailyReminderEnabled: true }));

    expect(mockNotifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    // Ordering is the whole point: scheduling first and cancelling after would
    // wipe the notification just registered.
    const cancelOrder =
      mockNotifications.cancelAllScheduledNotificationsAsync.mock.invocationCallOrder[0];
    const scheduleOrder =
      mockNotifications.scheduleNotificationAsync.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  it("schedules nothing when both prefs are off, but still cancels", async () => {
    await rescheduleNotifications(prefs());

    expect(mockNotifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("schedules the daily reminder at the requested time with a stable identifier", async () => {
    await rescheduleNotifications(
      prefs({ dailyReminderEnabled: true, dailyReminderTime: "07:30" })
    );

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "daily-reminder",
        trigger: { hour: 7, minute: 30, type: "daily" },
      })
    );
  });

  it("schedules re-engagement independently of the daily reminder", async () => {
    await rescheduleNotifications(
      prefs({ reengagementEnabled: true, reengagementTime: "20:15" })
    );

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "reengagement",
        trigger: { hour: 20, minute: 15, type: "daily" },
      })
    );
  });

  it("schedules both when both are enabled", async () => {
    await rescheduleNotifications(
      prefs({ dailyReminderEnabled: true, reengagementEnabled: true })
    );

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const identifiers = mockNotifications.scheduleNotificationAsync.mock.calls.map(
      ([request]) => request.identifier
    );
    expect(identifiers).toEqual(["daily-reminder", "reengagement"]);
  });

  it("gives every scheduled notification non-empty copy", async () => {
    await rescheduleNotifications(
      prefs({ dailyReminderEnabled: true, reengagementEnabled: true })
    );

    for (const [request] of mockNotifications.scheduleNotificationAsync.mock.calls) {
      expect(request.content.title).toBeTruthy();
      expect(request.content.body).toBeTruthy();
    }
  });
});

/**
 * `parseTime` is not exported, so it is driven through the only caller. These
 * are the cases that matter: a malformed persisted preference must not schedule
 * a notification at `NaN:NaN`, which the SDK accepts silently and then never
 * fires.
 */
describe("rescheduleNotifications — malformed times fall back to 09:00", () => {
  const malformed = [
    ["out-of-range hour", "25:00"],
    ["out-of-range minute", "09:75"],
    ["negative hour", "-1:00"],
    ["no separator", "9"],
    ["empty string", ""],
    ["non-numeric", "ab:cd"],
  ] as const;

  it.each(malformed)("%s (%s)", async (_label, time) => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await rescheduleNotifications(
      prefs({ dailyReminderEnabled: true, dailyReminderTime: time })
    );

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: { hour: 9, minute: 0, type: "daily" } })
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(time));

    warn.mockRestore();
  });

  it("accepts the boundary values 00:00 and 23:59 unchanged", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await rescheduleNotifications(
      prefs({
        dailyReminderEnabled: true,
        dailyReminderTime: "00:00",
        reengagementEnabled: true,
        reengagementTime: "23:59",
      })
    );

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ trigger: { hour: 0, minute: 0, type: "daily" } })
    );
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ trigger: { hour: 23, minute: 59, type: "daily" } })
    );
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe("Android channel creation", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  });

  it("is skipped on iOS", async () => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });

    await rescheduleNotifications(prefs());

    expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it("runs on Android — without a channel, Android silently drops every notification", async () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });

    await rescheduleNotifications(prefs());

    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ name: "Default" })
    );
  });
});
