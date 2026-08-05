import { create } from "zustand";
import type { SubscriptionTier } from "../types";
import { paywallProvider, PaywallError, isEntitled, FREE_SUBSCRIPTION } from "../services/paywall";
import type { PaywallSubscription, PaywallOffering } from "../services/paywall";
import { Analytics } from "../services/analytics";

type PaywallState = {
  /** The single gate for paid features. Derived — never set directly. */
  isPro: boolean;
  tier: SubscriptionTier;
  /** The full entitlement, for screens that render renewal or trial state. */
  subscription: PaywallSubscription;
  /** Boot-time hydration flag. Gates the splash screen — NOT per-action loading. */
  isLoading: boolean;
  /** True while a user-initiated purchase or restore is in flight. */
  isSubmitting: boolean;
  offering: PaywallOffering | null;
  isLoadingOffering: boolean;

  hydrate: () => Promise<void>;
  init: () => () => void;
  loadOffering: () => Promise<void>;
  /** Resolves false when the user dismissed the sheet — a non-event, not a failure. */
  purchase: (tier: SubscriptionTier) => Promise<boolean>;
  /** Resolves false when there was nothing to restore — a success, not a failure. */
  restore: () => Promise<boolean>;
};

/**
 * Derives the public shape from one subscription, so `isPro` and `tier` can
 * never disagree with `subscription`. Mirrors `applySession` in useAuthStore.
 */
function applySubscription(subscription: PaywallSubscription) {
  return { subscription, tier: subscription.tier, isPro: isEntitled(subscription) };
}

/**
 * Dismissing the purchase sheet is a deliberate user action, not a failure.
 * Swallowing it here rather than in each screen means no caller has to
 * special-case it, and nobody sees a red error for a tap they took back.
 */
function isCancellation(err: unknown): boolean {
  return err instanceof PaywallError && err.code === "cancelled";
}

export const usePaywallStore = create<PaywallState>((set) => ({
  ...applySubscription(FREE_SUBSCRIPTION),
  isLoading: true,
  isSubmitting: false,
  offering: null,
  isLoadingOffering: false,

  /**
   * Restores the entitlement once at boot. `app/_layout.tsx` holds the splash
   * screen until this settles.
   *
   * There is deliberately no `hydrationError` counterpart to `useAuthStore`'s.
   * `getSubscription()`'s contract is that it does not throw and does not
   * downgrade on doubt, so there is no "I couldn't ask" state to represent — and
   * blocking app boot behind a retry screen because a *paywall* couldn't reach
   * the network would gate the whole app on a feature most users never open.
   * See the contract in services/paywall/types.ts.
   */
  hydrate: async () => {
    try {
      set({ ...applySubscription(await paywallProvider.getSubscription()), isLoading: false });
    } catch {
      // The contract says this cannot happen. If a custom provider breaks it,
      // clearing isLoading is all we do — leaving the existing (free) state
      // untouched rather than actively downgrading, and above all never trapping
      // the user on the splash screen.
      set({ isLoading: false });
    }
  },

  /**
   * Opens the provider's entitlement subscription and returns its unsubscribe.
   * Call from a `useEffect` in `app/_layout.tsx` and return this as cleanup —
   * see the "Cleanup contracts" section of the `expo-services` skill.
   *
   * This catches every change the store never initiated: a renewal, an expiry, a
   * billing-retry recovery, a purchase made on another device — and a deferred
   * (Ask-to-Buy) purchase being approved, which has no other path back into the
   * app at all.
   */
  init: () => paywallProvider.subscribe((s) => set(applySubscription(s))),

  /**
   * Fetches the localized packages for display. Deliberately not part of
   * `hydrate()`: it is a store round-trip that would sit in front of the splash
   * screen for every user, including the majority who never open the paywall.
   *
   * Swallows the failure and leaves `offering` null — the screen renders
   * placeholder copy rather than an error, which is the right outcome for a
   * screen whose job is to sell something.
   */
  loadOffering: async () => {
    set({ isLoadingOffering: true });
    try {
      set({ offering: await paywallProvider.getOfferings() });
    } catch {
      set({ offering: null });
    } finally {
      set({ isLoadingOffering: false });
    }
  },

  /**
   * Resolves **true** when the store granted something, **false** when the user
   * dismissed the sheet.
   *
   * The boolean matters. Swallowing a cancellation keeps the red alert away from
   * a tap the user took back, but a caller that cannot tell the difference
   * treats the dismissal as a completed purchase — which closed the paywall on
   * anyone who changed their mind. Same shape as `restore()` for the same
   * reason: "nothing happened" is an outcome, not an error.
   */
  purchase: async (tier) => {
    set({ isSubmitting: true });
    try {
      const next = await paywallProvider.purchase(tier);
      set(applySubscription(next));
      // The tier the STORE granted, not the button that was pressed — a user can
      // be upgraded, or land on a different plan than the card they tapped.
      Analytics.subscriptionStarted(next.tier);
      return true;
    } catch (err) {
      // `payment_pending` is deliberately NOT swallowed: it propagates so the
      // screen can show its own "we'll unlock this when approved" copy.
      if (!isCancellation(err)) throw err;
      return false;
    } finally {
      set({ isSubmitting: false });
    }
  },

  /**
   * Re-reads entitlements from the store account.
   *
   * Resolving false means "checked, found nothing" — a successful answer, and
   * the common case for a user who is simply verifying. Only a real failure
   * (offline, store trouble) throws.
   */
  restore: async () => {
    set({ isSubmitting: true });
    try {
      const restored = await paywallProvider.restore();
      set(applySubscription(restored));
      return isEntitled(restored);
    } finally {
      set({ isSubmitting: false });
    }
  },
}));
