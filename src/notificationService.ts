import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import type { NotificationPrefs } from "./types";
import { APP_NAME, APP_SLUG } from "./constants";
import { pickRandom } from "./helpers";

const CHANNEL_ID = `${APP_SLUG}_reminders`;

// Notification ID registry — add new IDs starting from 1003
const DAILY_REMINDER_ID = 1001;
const REENGAGEMENT_ID   = 1002;

// ── Message copy — replace with app-specific wording ─────────────────────

function dailyReminderBody(): string {
  return pickRandom([
    `Don't forget to open ${APP_NAME} today!`,
    `${APP_NAME} is waiting for you. Take a moment to check in.`,
    `Your daily reminder: open ${APP_NAME} and keep the habit going.`,
  ]);
}

function reengagementBody(): string {
  return pickRandom([
    `It's been a while! Come back to ${APP_NAME}.`,
    `${APP_NAME} misses you. Ready to pick up where you left off?`,
    `Your streak is waiting. Open ${APP_NAME} today!`,
  ]);
}

// ── Time helpers ──────────────────────────────────────────────────────────

function nextOccurrence(timeStr: string, alwaysTomorrow: boolean): Date {
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (alwaysTomorrow || target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await LocalNotifications.requestPermissions();
    return result.display === "granted";
  } catch {
    return false;
  }
}

export async function checkNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await LocalNotifications.checkPermissions();
    return result.display === "granted";
  } catch {
    return false;
  }
}

/** Reschedules (or cancels) notifications based on current prefs.
 *  Call on app foreground and whenever prefs change. */
export async function rescheduleNotifications(prefs: NotificationPrefs): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const granted = await checkNotificationPermission();
  if (!granted) return;

  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: DAILY_REMINDER_ID },
        { id: REENGAGEMENT_ID },
      ],
    });
  } catch {
    // ignore if none were scheduled
  }

  const toSchedule: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];

  if (prefs.dailyReminderEnabled) {
    const at = nextOccurrence(prefs.dailyReminderTime, true);
    toSchedule.push({
      id: DAILY_REMINDER_ID,
      title: `${APP_NAME} reminder`,
      body: dailyReminderBody(),
      schedule: { at, allowWhileIdle: true },
      smallIcon: "ic_launcher_foreground",
      channelId: CHANNEL_ID,
    });
  }

  if (prefs.reengagementEnabled) {
    const at = nextOccurrence(prefs.reengagementTime, false);
    if (at.getTime() > Date.now()) {
      toSchedule.push({
        id: REENGAGEMENT_ID,
        title: `${APP_NAME} misses you!`,
        body: reengagementBody(),
        schedule: { at, allowWhileIdle: true },
        smallIcon: "ic_launcher_foreground",
        channelId: CHANNEL_ID,
      });
    }
  }

  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
}

/** Create the Android notification channel. Call once on app start. */
export async function createNotificationChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: `${APP_NAME} Reminders`,
      description: "Daily reminders and re-engagement nudges",
      importance: 4, // HIGH
      visibility: 1, // PUBLIC
      vibration: true,
    });
  } catch {
    // createChannel may not exist on all versions — safe to ignore
  }
}
