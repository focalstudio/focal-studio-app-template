import { create } from "zustand";
import type { Theme, NotificationPrefs } from "../types";
import { STORAGE_PREFIX, DEV_MODE_KEY } from "../constants";
import { loadJson, saveJson, loadString, saveString } from "../utils/storage";
import { themeSchema, storedNotificationPrefsSchema } from "../types/schemas";
import { rescheduleNotifications } from "../services/notifications";
import { Analytics, setAnalyticsEnabled as applyAnalyticsEnabled } from "../services/analytics";

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

/** Built once — each field falls back to its default independently on read. */
const STORED_PREFS_SCHEMA = storedNotificationPrefsSchema(DEFAULT_NOTIF_PREFS);

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
    applyAnalyticsEnabled(analyticsEnabled);
  },

  setDevMode: (devMode) => {
    set({ devMode });
    saveString(DEV_MODE_KEY_STORE, String(devMode));
  },

  hydrate: async () => {
    const theme = themeSchema.catch("device").parse(await loadString(THEME_KEY, "device"));
    const notificationPrefs = await loadJson(NOTIF_KEY, DEFAULT_NOTIF_PREFS, STORED_PREFS_SCHEMA);

    const analyticsStr = await loadString(`${STORAGE_PREFIX}analytics`, "true");
    const devModeStr = await loadString(DEV_MODE_KEY_STORE, "false");
    const analyticsEnabled = analyticsStr !== "false";

    // Push the persisted preference into the analytics service. Without this the
    // service's module-level `enabled` flag stays at its `true` default on every
    // cold start, silently re-opting-in a user who had opted out.
    applyAnalyticsEnabled(analyticsEnabled);

    set({
      theme,
      notificationPrefs,
      analyticsEnabled,
      devMode: devModeStr === "true",
    });
  },
}));
