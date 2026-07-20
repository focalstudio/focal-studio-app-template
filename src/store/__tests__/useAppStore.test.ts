import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppStore } from "../useAppStore";
import { STORAGE_PREFIX, DEV_MODE_KEY } from "../../constants";

const THEME_KEY = `${STORAGE_PREFIX}theme`;
const NOTIF_KEY = `${STORAGE_PREFIX}notification_prefs`;
const ANALYTICS_KEY = `${STORAGE_PREFIX}analytics`;

jest.mock("../../services/analytics", () => ({
  Analytics: { appError: jest.fn() },
}));
jest.mock("../../services/notifications", () => ({
  rescheduleNotifications: jest.fn().mockResolvedValue(undefined),
}));

const { rescheduleNotifications } = jest.requireMock("../../services/notifications") as {
  rescheduleNotifications: jest.Mock;
};

const initialState = useAppStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useAppStore.setState(initialState, true);
  rescheduleNotifications.mockClear();
});

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
  });

  it("setNotificationPrefs persists and triggers rescheduleNotifications", () => {
    const prefs = {
      dailyReminderEnabled: true,
      dailyReminderTime: "08:00",
      reengagementEnabled: true,
      reengagementTime: "20:00",
    };
    useAppStore.getState().setNotificationPrefs(prefs);
    expect(useAppStore.getState().notificationPrefs).toEqual(prefs);
    expect(rescheduleNotifications).toHaveBeenCalledWith(prefs);
  });

  it("setDevMode writes to the version-scoped DEV_MODE_KEY", async () => {
    useAppStore.getState().setDevMode(true);
    expect(await AsyncStorage.getItem(DEV_MODE_KEY)).toBe("true");
  });

  describe("hydrate", () => {
    it("restores a valid persisted theme", async () => {
      await AsyncStorage.setItem(THEME_KEY, "dark");
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().theme).toBe("dark");
    });

    it("falls back to 'device' for an invalid persisted theme", async () => {
      await AsyncStorage.setItem(THEME_KEY, "blue");
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().theme).toBe("device");
    });

    it("fills in missing notification-prefs fields with defaults", async () => {
      await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify({ dailyReminderEnabled: true }));
      await useAppStore.getState().hydrate();
      const prefs = useAppStore.getState().notificationPrefs;
      expect(prefs.dailyReminderEnabled).toBe(true);
      expect(prefs.dailyReminderTime).toBe("09:00");
      expect(prefs.reengagementEnabled).toBe(false);
      expect(prefs.reengagementTime).toBe("18:00");
    });

    it("falls back to default for a wrong-typed notification-prefs field", async () => {
      await AsyncStorage.setItem(
        NOTIF_KEY,
        JSON.stringify({ dailyReminderTime: 900 })
      );
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().notificationPrefs.dailyReminderTime).toBe("09:00");
    });

    it("analyticsEnabled defaults to true and is off only for the exact string 'false'", async () => {
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().analyticsEnabled).toBe(true);

      await AsyncStorage.setItem(ANALYTICS_KEY, "false");
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().analyticsEnabled).toBe(false);

      await AsyncStorage.setItem(ANALYTICS_KEY, "no");
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().analyticsEnabled).toBe(true);
    });

    it("devMode defaults to false and is on only for the exact string 'true'", async () => {
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().devMode).toBe(false);

      await AsyncStorage.setItem(DEV_MODE_KEY, "true");
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().devMode).toBe(true);

      await AsyncStorage.setItem(DEV_MODE_KEY, "yes");
      await useAppStore.getState().hydrate();
      expect(useAppStore.getState().devMode).toBe(false);
    });
  });
});
