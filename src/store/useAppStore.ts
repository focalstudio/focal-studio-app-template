import { create } from "zustand";
import type { Theme, NotificationPrefs } from "../types";
import { STORAGE_PREFIX } from "../constants";
import { loadJson, saveJson, loadString, saveString } from "../utils/storage";

const THEME_KEY = `${STORAGE_PREFIX}theme`;
const NOTIF_KEY = `${STORAGE_PREFIX}notification_prefs`;
const DEV_MODE_KEY_STORE = `${STORAGE_PREFIX}dev_mode_0.1.0`;

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
    const theme = (await loadString(THEME_KEY, "device")) as Theme;
    const notificationPrefs = await loadJson(NOTIF_KEY, DEFAULT_NOTIF_PREFS);
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
