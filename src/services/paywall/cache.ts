import { STORAGE_PREFIX } from "../../constants";
import { loadJson, saveJson, removeItem } from "../../utils/storage";
import { FREE_SUBSCRIPTION, storedSubscriptionSchema } from "./types";
import type { PaywallSubscription } from "./types";

/**
 * The last entitlement this device saw.
 *
 * Unchanged from the pre-port store's key, deliberately: a device that already
 * holds a `{ tier: "annual" }` blob must read back as annual, not as free.
 * `storedSubscriptionSchema`'s per-field `.catch()` completes the older shape.
 */
export const SUBSCRIPTION_KEY = `${STORAGE_PREFIX}subscription`;

/**
 * A local mirror of the user's entitlement, shared by every provider.
 *
 * This exists to make rule 1 of `PaywallProvider.getSubscription()` — *never
 * downgrade on doubt* — actually hold, rather than depending on a vendor's
 * caching behaviour. A real provider's SDK usually serves a cached
 * `CustomerInfo` when the network is unreachable, but "usually" is not a
 * contract, and the failure it protects against is revoking access someone paid
 * for.
 *
 * The rule for an adapter: write through on every authoritative answer, read
 * back only when the provider could not give one.
 *
 * It lives in `src/services/` rather than beside an adapter in `templates/` for
 * the usual reason — tsc, eslint and jest all see it here, and none of them see
 * `templates/`.
 */
export async function loadCachedSubscription(): Promise<PaywallSubscription> {
  return loadJson(SUBSCRIPTION_KEY, FREE_SUBSCRIPTION, storedSubscriptionSchema);
}

/**
 * Mirrors an authoritative answer locally. Fire-and-forget by design: the
 * storage helpers swallow write failures, and a failed mirror must never turn a
 * successful purchase into a thrown error.
 */
export async function cacheSubscription(subscription: PaywallSubscription): Promise<void> {
  await saveJson(SUBSCRIPTION_KEY, subscription);
}

export async function clearCachedSubscription(): Promise<void> {
  await removeItem(SUBSCRIPTION_KEY);
}
