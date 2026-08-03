import { create } from "zustand";
import { STORAGE_PREFIX } from "../constants";
import { loadJson, saveJson } from "../utils/storage";
import { storedSubscriptionSchema } from "../types/schemas";
import type { SubscriptionTier } from "../types";

const PAYWALL_KEY = `${STORAGE_PREFIX}subscription`;

type PaywallState = {
  isPro: boolean;
  tier: SubscriptionTier;
  isLoading: boolean;
  setSubscription: (tier: SubscriptionTier) => void;
  hydrate: () => Promise<void>;
};

export const usePaywallStore = create<PaywallState>((set) => ({
  isPro: false,
  tier: "free",
  isLoading: true,

  setSubscription: (tier) => {
    const isPro = tier !== "free";
    set({ isPro, tier });
    saveJson(PAYWALL_KEY, { tier });
  },

  hydrate: async () => {
    const { tier } = await loadJson(PAYWALL_KEY, { tier: "free" as const }, storedSubscriptionSchema);
    set({ tier, isPro: tier !== "free", isLoading: false });
  },
}));

/*
 * To wire in RevenueCat:
 * 1. `npx expo install react-native-purchases`
 * 2. Configure Purchases.configure({ apiKey: "..." }) in app/_layout.tsx
 * 3. Replace setSubscription with Purchases.purchasePackage() calls
 * 4. Use Purchases.getCustomerInfo() to hydrate isPro on app launch
 */
