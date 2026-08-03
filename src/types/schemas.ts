/**
 * Runtime schemas for everything the app persists.
 *
 * These are the source of truth: the types in `./index.ts` are derived from them
 * with `z.infer`, so a shape can't drift from its validator. Read them back
 * through `loadJson(key, fallback, schema)` — see `src/utils/storage.ts`.
 */
import { z } from "zod";

export const themeSchema = z.enum(["light", "dark", "device"]);

/** "HH:MM", 24-hour. Matches what `parseTime` in `services/notifications.ts` expects. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected "HH:MM"');

export const notificationPrefsSchema = z.object({
  dailyReminderEnabled: z.boolean(),
  dailyReminderTime: timeOfDaySchema,
  reengagementEnabled: z.boolean(),
  reengagementTime: timeOfDaySchema,
});

/**
 * Storage-boundary variant of the above: every field falls back independently,
 * so one bad or missing field does not discard the other three. This mirrors the
 * per-field `typeof` chain it replaced — a schema change in a future version
 * shouldn't silently reset a user's reminder settings.
 *
 * `.catch()` fires on a missing key too (the field schema receives `undefined`,
 * fails, catches), so parsing `{}` yields a complete defaults object. Build it
 * once at module scope from the caller's defaults.
 */
export function storedNotificationPrefsSchema(d: z.infer<typeof notificationPrefsSchema>) {
  return z.object({
    dailyReminderEnabled: z.boolean().catch(d.dailyReminderEnabled),
    dailyReminderTime: timeOfDaySchema.catch(d.dailyReminderTime),
    reengagementEnabled: z.boolean().catch(d.reengagementEnabled),
    reengagementTime: timeOfDaySchema.catch(d.reengagementTime),
  });
}

export const userSchema = z.object({
  id: z.string(),
  // Deliberately `z.string()` and not `z.email()`. This validates a blob we
  // already accepted at sign-in; tightening it here would sign out real users
  // whose provider issued an address zod's format check happens to reject.
  email: z.string(),
  // A bad display name must not invalidate an otherwise usable session.
  name: z.string().optional().catch(undefined),
});

export const subscriptionTierSchema = z.enum(["free", "monthly", "annual", "lifetime"]);

/** What `usePaywallStore` writes to storage. An unknown tier reads back as free. */
export const storedSubscriptionSchema = z.object({
  tier: subscriptionTierSchema.catch("free"),
});
