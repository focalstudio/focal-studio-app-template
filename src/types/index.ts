/**
 * App-wide types, derived from the runtime schemas in `./schemas.ts` so a shape
 * and its validator can never drift apart. Add a new persisted type by writing
 * the schema first, then inferring it here.
 *
 * Every import below is type-only, so this barrel pulls no runtime code — zod
 * reaches the bundle only via the modules that import `./schemas` directly.
 */
import type { z } from "zod";
import type {
  themeSchema,
  notificationPrefsSchema,
  userSchema,
  subscriptionTierSchema,
} from "./schemas";

export type Theme = z.infer<typeof themeSchema>;

/** Both time fields are "HH:MM", 24-hour — enforced by `timeOfDaySchema`. */
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export type User = z.infer<typeof userSchema>;

export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;
