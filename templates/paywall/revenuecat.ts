/**
 * RevenueCat adapter for the `PaywallProvider` port.
 *
 * Installed by `bash scripts/add-paywall.sh revenuecat`, which copies this file
 * to `src/services/paywall/revenuecat.ts` — **the relative imports below assume
 * that location**, not this one. `templates/` is excluded from tsconfig, eslint
 * and jest, so nothing here is checked until the script has run.
 *
 * That exclusion is also why this file is as thin as it is. Every branch with
 * real logic in it — entitlement → tier, package selection, intro-offer copy,
 * SDK error code → port code — lives in `src/services/paywall/`, where CI can
 * see it and where it has tests. The rule while editing this file: if you are
 * writing an `if` that is not a null-check on an SDK return value, it belongs in
 * `src/`.
 *
 * Docs: docs/paywall/revenuecat.md
 */

import { Platform } from "react-native";
import Purchases, { PURCHASES_ERROR_CODE } from "react-native-purchases";
import type { CustomerInfo, PurchasesEntitlementInfo } from "react-native-purchases";

import { requireEnv } from "../../env";
import { PaywallError } from "./types";
import type { PaywallProvider, PaywallSubscription, PaywallOffering } from "./types";
import { toSubscription } from "./entitlement";
import { selectPackage, toOffering } from "./offerings";
import { toPaywallError } from "./errors";
import { loadCachedSubscription, cacheSubscription } from "./cache";
import type { SubscriptionTier } from "../../types";

// ---------------------------------------------------------------------------
// EDIT THIS BLOCK — it is the only part of this file you need to change.
// `scripts/add-paywall.sh` deliberately never rewrites this file, so your edits
// here survive re-running it.
// ---------------------------------------------------------------------------

/** The entitlement identifier from your RevenueCat dashboard. Case-sensitive. */
const ENTITLEMENT_ID = "pro";

/**
 * Optional. Only needed if your product identifiers do not already end in a
 * recognised tier token — `resolveTier` reads `.monthly` / `.annual` /
 * `.yearly` / `.lifetime` off the identifier without any help.
 *
 * Recommended naming, which needs no entry here at all:
 *     <bundleId>.pro.monthly
 *     <bundleId>.pro.annual
 *     <bundleId>.pro.lifetime
 *
 * Bundle-id prefixes because App Store Connect product ids are immutable and
 * unique across your whole developer account; lowercase because Play restricts
 * ids to lowercase alphanumerics, `.` and `_`. The pattern satisfies both.
 */
const PRODUCT_TIERS: Readonly<Record<string, SubscriptionTier>> = {};

// ---------------------------------------------------------------------------

/**
 * Configured once, at module scope.
 *
 * Deliberately not in a component's `useEffect`: that re-runs on every mount and
 * on every Fast Refresh, and the same reasoning is why
 * `templates/backends/supabase/supabase.ts` registers its `AppState` listener
 * here rather than in a component.
 *
 * Android's key stays optional in `env.js` — this template is iOS-first and
 * Android is opt-in — so `requireEnv` is what turns a missing Play key into a
 * readable message on an Android build instead of failing every iOS-only app's
 * build at config time.
 */
Purchases.configure({
  apiKey: requireEnv(
    Platform.OS === "android"
      ? "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY"
      : "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY"
  ),
});

/** The active entitlement out of a `CustomerInfo`, or undefined. */
function activeEntitlement(info: CustomerInfo): PurchasesEntitlementInfo | undefined {
  // `entitlements.active` and never `activeSubscriptions`: the latter misses
  // lifetime non-consumables and every promotional or Stripe grant, so a
  // support-granted lifetime user would be shown the paywall.
  return info.entitlements.active[ENTITLEMENT_ID];
}

/** Maps a `CustomerInfo` onto the port's shape and mirrors it locally. */
async function applyCustomerInfo(info: CustomerInfo): Promise<PaywallSubscription> {
  const subscription = toSubscription(activeEntitlement(info), PRODUCT_TIERS);
  await cacheSubscription(subscription);
  return subscription;
}

export const revenuecatPaywallProvider: PaywallProvider = {
  name: "revenuecat",

  /**
   * Never throws and never downgrades on doubt — rule 1 and 2 of the port.
   *
   * RevenueCat's SDK serves a cached `CustomerInfo` offline, so the happy path
   * already survives a plane. The catch is for the case where it cannot answer
   * at all: fall back to the last entitlement this device saw rather than
   * reporting free, because reporting free revokes access someone paid for.
   */
  async getSubscription(): Promise<PaywallSubscription> {
    try {
      return await applyCustomerInfo(await Purchases.getCustomerInfo());
    } catch {
      return loadCachedSubscription();
    }
  },

  /**
   * Null when there is nothing to sell — no `current` offering configured, or an
   * offering with no packages this app can map to a tier. Null is an answer, so
   * the paywall screen falls back to placeholder copy rather than an error.
   */
  async getOfferings(): Promise<PaywallOffering | null> {
    try {
      const current = (await Purchases.getOfferings()).current;
      if (current === null) return null;

      const offering = toOffering(current.identifier, current.availablePackages, PRODUCT_TIERS);
      return offering.packages.length === 0 ? null : offering;
    } catch (err) {
      throw toPaywallError(err, "Could not load the available plans.");
    }
  },

  async purchase(tier: SubscriptionTier): Promise<PaywallSubscription> {
    let pkg;
    try {
      const current = (await Purchases.getOfferings()).current;
      if (current === null) {
        throw new PaywallError(
          "not_configured",
          "No current offering is set in RevenueCat. Create one and mark it current, " +
            "then attach your products to it."
        );
      }

      pkg = selectPackage(current.availablePackages, tier, PRODUCT_TIERS);
      if (pkg === null) {
        throw new PaywallError(
          "not_configured",
          `Offering "${current.identifier}" has no "${tier}" package. Add one in the ` +
            `RevenueCat dashboard, or map its product id in PRODUCT_TIERS at the top of ` +
            `src/services/paywall/revenuecat.ts.`
        );
      }
    } catch (err) {
      throw toPaywallError(err, "Could not load the available plans.");
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      // What the store actually granted, never the tier that was asked for — a
      // user can be upgraded, or land on a different plan than the one tapped.
      return await applyCustomerInfo(customerInfo);
    } catch (err) {
      throw toPaywallError(err, "The purchase could not be completed.");
    }
  },

  /**
   * Resolving free here is a successful answer — the caller inspects the result
   * rather than catching. But an unreachable store must throw, because silently
   * reporting free would tell a paying user they own nothing.
   */
  async restore(): Promise<PaywallSubscription> {
    try {
      return await applyCustomerInfo(await Purchases.restorePurchases());
    } catch (err) {
      throw toPaywallError(err, "Could not restore your purchases.");
    }
  },

  subscribe(onChange: (subscription: PaywallSubscription) => void): () => void {
    const listener = (info: CustomerInfo) => {
      void applyCustomerInfo(info).then(onChange);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    // Returning our own removal rather than whatever `add...` happens to return:
    // the SDK's return value has changed shape across major versions, and the
    // port requires an unsubscribe that works.
    return () => Purchases.removeCustomerInfoUpdateListener(listener);
  },

  /**
   * Binds entitlements to the app account, so they follow the user across
   * devices and reinstalls — and so the next person to sign in on a shared
   * device does not inherit them.
   *
   * Safe to call repeatedly with the same id: RevenueCat treats a `logIn` with
   * the current app-user id as a no-op.
   */
  async identify(appUserId: string): Promise<void> {
    try {
      const { customerInfo } = await Purchases.logIn(appUserId);
      await applyCustomerInfo(customerInfo);
    } catch (err) {
      throw toPaywallError(err, "Could not link your purchases to your account.");
    }
  },

  /**
   * Returns the SDK to anonymous mode. Does NOT revoke anything — the store
   * account still owns whatever it bought.
   */
  async forget(): Promise<void> {
    try {
      await applyCustomerInfo(await Purchases.logOut());
    } catch (err) {
      // Already anonymous, so the postcondition this method exists to establish
      // is already true — not a failure. Surfacing it would break sign-out for
      // anyone who never signed in.
      //
      // Compared against the SDK's own enum rather than the literal "22": this
      // is the adapter, so it may import the SDK, and `errors.ts` cannot (it
      // lives in src/ for CI coverage, where the SDK is not a dependency). A
      // hardcoded numeral here would be the one copy that drifts silently.
      const code = (err as { code?: unknown })?.code;
      if (String(code) === String(PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR)) return;

      throw toPaywallError(err, "Could not unlink your purchases.");
    }
  },
};
