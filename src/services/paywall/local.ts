import { STORAGE_PREFIX } from "../../constants";
import { loadJson, saveJson, removeItem } from "../../utils/storage";
import { PaywallError, FREE_SUBSCRIPTION, storedSubscriptionSchema } from "./types";
import type { PaywallProvider, PaywallSubscription } from "./types";

/**
 * Unchanged from the pre-port store, deliberately: a device that already holds a
 * `{ tier: "annual" }` blob under this key must read back as annual, not as
 * free. `storedSubscriptionSchema`'s per-field `.catch()` is what completes the
 * older shape into a full subscription.
 */
const SUBSCRIPTION_KEY = `${STORAGE_PREFIX}subscription`;

function notWired(action: string): PaywallError {
  return new PaywallError(
    "not_wired",
    `${action} requires a paywall provider. Run \`bash scripts/add-paywall.sh revenuecat\`, ` +
      `or implement the PaywallProvider port in src/services/paywall/.`
  );
}

/**
 * The no-provider scaffold. It answers the read path from storage so the app is
 * navigable and the paywall screen stays renderable during UI development, but
 * every call that would need a real store throws `not_wired`.
 *
 * That is deliberate, and it is the same reasoning `services/auth/local.ts`
 * gives. The previous store exposed `setSubscription(tier)` — a public,
 * synchronous method that granted Pro with no payment and persisted it. That is
 * the entitlement twin of the fake-signup bug this repo already removed from
 * auth, and it shipped silently in any app whose author hadn't wired a paywall.
 * Failing loudly is the safer default.
 */
export const localPaywallProvider: PaywallProvider = {
  name: "local",

  /**
   * A pure AsyncStorage read, so it never throws and never downgrades — both
   * rules of the port contract are satisfied trivially here.
   */
  async getSubscription(): Promise<PaywallSubscription> {
    return loadJson(SUBSCRIPTION_KEY, FREE_SUBSCRIPTION, storedSubscriptionSchema);
  },

  /**
   * Null, not a throw. There is genuinely nothing to sell, which is an answer;
   * and the paywall screen has to stay renderable with no provider wired, which
   * is the whole reason this scaffold exists.
   */
  async getOfferings(): Promise<null> {
    return null;
  },

  async purchase(): Promise<PaywallSubscription> {
    throw notWired("Purchasing");
  },

  /**
   * Throws rather than resolving free. Resolving free here would be a lie with
   * the shape of a fact — "we checked your Apple ID and you own nothing". The
   * honest answer is that there is nothing here that can check.
   */
  async restore(): Promise<PaywallSubscription> {
    throw notWired("Restoring purchases");
  },

  /** No external event source, so nothing to observe and nothing to tear down. */
  subscribe(): () => void {
    return () => {};
  },

  // identify / forget are intentionally absent: the scaffold has no store
  // account to bind, and omitting them lets the store skip the call rather than
  // pretend it succeeded.
};

/**
 * Test seam. Puts the app into an entitled state without a store, for tests and
 * for a dev-only toggle. Not exported from the barrel — import it directly.
 *
 * Inert once a real provider is wired: nothing reads this key any more.
 */
export async function seedLocalSubscription(
  subscription: PaywallSubscription = { ...FREE_SUBSCRIPTION, tier: "annual" }
): Promise<void> {
  await saveJson(SUBSCRIPTION_KEY, subscription);
}

/** Companion to `seedLocalSubscription`, so a test can return to a clean slate. */
export async function clearLocalSubscription(): Promise<void> {
  await removeItem(SUBSCRIPTION_KEY);
}
