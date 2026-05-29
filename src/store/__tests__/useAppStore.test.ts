import { useAppStore } from "../useAppStore";

jest.mock("../../services/analytics", () => ({
  Analytics: { appError: jest.fn() },
}));
jest.mock("../../services/notifications", () => ({
  rescheduleNotifications: jest.fn().mockResolvedValue(undefined),
}));

describe("useAppStore", () => {
  it("initializes with correct defaults", () => {
    const state = useAppStore.getState();
    expect(state.theme).toBe("device");
    expect(state.analyticsEnabled).toBe(true);
    expect(state.devMode).toBe(false);
    expect(state.notificationPrefs.dailyReminderEnabled).toBe(false);
    expect(state.notificationPrefs.reengagementEnabled).toBe(false);
  });

  it("updates theme via setTheme", () => {
    useAppStore.getState().setTheme("dark");
    expect(useAppStore.getState().theme).toBe("dark");
    useAppStore.getState().setTheme("device");
  });
});
