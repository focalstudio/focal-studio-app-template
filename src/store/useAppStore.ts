import { create } from "zustand";
import type { Theme, NotificationPrefs } from "../types";
import { STORAGE_PREFIX, DEV_MODE_KEY } from "../constants";
import { loadJson, saveJson, loadString, saveString } from "../utils/storage";
import { rescheduleNotifications } from "../services/notifications";
import { Analytics } from "../services/analytics";

const THEME_KEY = `${STORAGE_PREFIX}theme`;
const NOTIF_KEY = `${STORAGE_PREFIX}notification_prefs`;
// DEV_MODE_KEY is imported from constants — it includes the app version so dev
// mode resets automatically on every version upgrade (as designed).
const DEV_MODE_KEY_STORE = DEV_MODE_KEY;

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  dailyReminderEnabled: false,
  dailyReminderTime: "09:00",
  reengagementEnabled: false,
  reengagementTime: "18:00",
};

type AppState = {
  theme: Theme;
  notificationPrefs: NotificationPrefs;
  analyticsEnabled: boolean;
  devMode: boolean;
  setTheme: (t: Theme) => void;
  setNotificationPrefs: (prefs: NotificationPrefs) => void;
  setAnalyticsEnabled: (v: boolean) => void;
  setDevMode: (v: boolean) => void;
  hydrate: () => Promise<void>;
};

export const useAppStore = create<AppState>((set) => ({
  theme: "device",
  notificationPrefs: DEFAULT_NOTIF_PREFS,
  analyticsEnabled: true,
  devMode: false,

  setTheme: (theme) => {
    set({ theme });
    saveString(THEME_KEY, theme);
  },

  setNotificationPrefs: (prefs) => {
    set({ notificationPrefs: prefs });
    saveJson(NOTIF_KEY, prefs);
    rescheduleNotifications(prefs).catch((e) => {
      Analytics.appError(e instanceof Error ? e.message : String(e), "rescheduleNotifications");
    });
  },

  setAnalyticsEnabled: (analyticsEnabled) => {
    set({ analyticsEnabled });
    saveString(`${STORAGE_PREFIX}analytics`, String(analyticsEnabled));
  },

  setDevMode: (devMode) => {
    set({ devMode });
    saveString(DEV_MODE_KEY_STORE, String(devMode));
  },

  hydrate: async () => {
    const validThemes: Theme[] = ["light", "dark", "device"];
    const rawTheme = await loadString(THEME_KEY, "device");
    const theme: Theme = (validThemes as string[]).includes(rawTheme)
      ? (rawTheme as Theme)
      : "device";

    const rawPrefs = await loadJson<Partial<NotificationPrefs>>(NOTIF_KEY, DEFAULT_NOTIF_PREFS);
    const notificationPrefs: NotificationPrefs = {
      dailyReminderEnabled: typeof rawPrefs.dailyReminderEnabled === "boolean"
        ? rawPrefs.dailyReminderEnabled
        : DEFAULT_NOTIF_PREFS.dailyReminderEnabled,
      dailyReminderTime: typeof rawPrefs.dailyReminderTime === "string"
        ? rawPrefs.dailyReminderTime
        : DEFAULT_NOTIF_PREFS.dailyReminderTime,
      reengagementEnabled: typeof rawPrefs.reengagementEnabled === "boolean"
        ? rawPrefs.reengagementEnabled
        : DEFAULT_NOTIF_PREFS.reengagementEnabled,
      reengagementTime: typeof rawPrefs.reengagementTime === "string"
        ? rawPrefs.reengagementTime
        : DEFAULT_NOTIF_PREFS.reengagementTime,
    };

    const analyticsStr = await loadString(`${STORAGE_PREFIX}analytics`, "true");
    const devModeStr = await loadString(DEV_MODE_KEY_STORE, "false");

    set({
      theme,
      notificationPrefs,
      analyticsEnabled: analyticsStr !== "false",
      devMode: devModeStr === "true",
    });
  },
}));
