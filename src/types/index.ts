export type Theme = "light" | "dark" | "device";

export type NotificationPrefs = {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // "HH:MM" 24h
  reengagementEnabled: boolean;
  reengagementTime: string; // "HH:MM" 24h
};

export type User = {
  id: string;
  email: string;
  name?: string;
};

export type SubscriptionTier = "free" | "monthly" | "annual" | "lifetime";
