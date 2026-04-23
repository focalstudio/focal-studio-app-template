import type { Theme, NotificationPrefs } from "./types";
import { STORAGE_PREFIX } from "./constants";

// ── Generic helpers ────────────────────────────────────────────────────────

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadNumber(key: string, fallback = 0): number {
  const raw = localStorage.getItem(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function saveNumber(key: string, value: number): void {
  localStorage.setItem(key, String(value));
}

export function loadStringArray(key: string): string[] {
  return loadJson<string[]>(key, []);
}

export function saveStringArray(key: string, value: string[]): void {
  saveJson(key, value);
}

// ── Theme ──────────────────────────────────────────────────────────────────

export function loadTheme(): Theme {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}_theme`);
  if (raw === "dark" || raw === "device") return raw;
  return "light";
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(`${STORAGE_PREFIX}_theme`, theme);
}

// ── Notification preferences ───────────────────────────────────────────────

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dailyReminderEnabled: true,
  dailyReminderTime: "20:00",
  reengagementEnabled: true,
  reengagementTime: "14:00",
};

export function loadNotificationPrefs(): NotificationPrefs {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}_notification_prefs`);
  if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(`${STORAGE_PREFIX}_notification_prefs`, JSON.stringify(prefs));
}

// ── Export / Import ────────────────────────────────────────────────────────
// Populate ALL_STORAGE_KEYS with every key your app uses in localStorage.
// This is used by exportAllData / importAllData for data portability.

const ALL_STORAGE_KEYS: string[] = [
  `${STORAGE_PREFIX}_theme`,
  `${STORAGE_PREFIX}_notification_prefs`,
  // TODO: add your app-specific keys here
];

export function exportAllData(): string {
  const data: Record<string, string | null> = {};
  for (const key of ALL_STORAGE_KEYS) {
    data[key] = localStorage.getItem(key);
  }
  return JSON.stringify(data, null, 2);
}

export function importAllData(json: string): { success: boolean; error?: string } {
  try {
    const data = JSON.parse(json);
    if (typeof data !== "object" || data === null) {
      return { success: false, error: "Invalid format: expected a JSON object." };
    }
    for (const key of ALL_STORAGE_KEYS) {
      if (key in data && data[key] !== null) {
        localStorage.setItem(key, String(data[key]));
      }
    }
    return { success: true };
  } catch {
    return { success: false, error: "Failed to parse JSON file." };
  }
}
