export type Theme = "light" | "dark" | "device";

// Replace with your app's actual tab names.
export type AppView = "home" | "settings";

export type NotificationPrefs = {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;   // "HH:MM" 24h format, e.g. "20:00"
  reengagementEnabled: boolean;
  reengagementTime: string;    // "HH:MM" 24h format, e.g. "14:00"
};
