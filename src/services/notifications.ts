import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { pickRandom } from "../utils/helpers";
import type { NotificationPrefs } from "../types";

const DAILY_REMINDER_ID = "daily-reminder";
const REENGAGEMENT_ID = "reengagement";

const DAILY_COPIES = [
  { title: "[APP_NAME]", body: "Your daily session is waiting for you." },
  { title: "Time to focus", body: "Open [APP_NAME] and get started." },
  { title: "[APP_NAME]", body: "Keep the streak alive — just a few minutes." },
];

const REENGAGEMENT_COPIES = [
  { title: "Miss you!", body: "Come back to [APP_NAME] and pick up where you left off." },
  { title: "Your goals are waiting", body: "Open [APP_NAME] to get back on track." },
  { title: "[APP_NAME] misses you", body: "A small session today keeps the habit alive." },
];

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function checkNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

async function createAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [h, m] = timeStr.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    console.warn(`[Notifications] Invalid time "${timeStr}", defaulting to 09:00`);
    return { hour: 9, minute: 0 };
  }
  return { hour: h, minute: m };
}

export async function rescheduleNotifications(prefs: NotificationPrefs): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await createAndroidChannel();

  if (prefs.dailyReminderEnabled) {
    const { hour, minute } = parseTime(prefs.dailyReminderTime);
    const copy = pickRandom(DAILY_COPIES);
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content: { title: copy.title, body: copy.body, sound: true },
      trigger: { hour, minute, type: Notifications.SchedulableTriggerInputTypes.DAILY },
    });
  }

  if (prefs.reengagementEnabled) {
    const { hour, minute } = parseTime(prefs.reengagementTime);
    const copy = pickRandom(REENGAGEMENT_COPIES);
    await Notifications.scheduleNotificationAsync({
      identifier: REENGAGEMENT_ID,
      content: { title: copy.title, body: copy.body, sound: true },
      trigger: { hour, minute, type: Notifications.SchedulableTriggerInputTypes.DAILY },
    });
  }
}
