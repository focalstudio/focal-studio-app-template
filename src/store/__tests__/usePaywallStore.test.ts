import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePaywallStore } from "../usePaywallStore";
import { STORAGE_PREFIX } from "../../constants";

const PAYWALL_KEY = `${STORAGE_PREFIX}subscription`;

const initialState = usePaywallStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  usePaywallStore.setState(initialState, true);
});

describe("usePaywallStore", () => {
  it("setSubscription('free') results in isPro false", () => {
    usePaywallStore.getState().setSubscription("free");
    expect(usePaywallStore.getState().isPro).toBe(false);
    expect(usePaywallStore.getState().tier).toBe("free");
  });

  it.each(["monthly", "annual", "lifetime"] as const)(
    "setSubscription('%s') results in isPro true",
    (tier) => {
      usePaywallStore.getState().setSubscription(tier);
      expect(usePaywallStore.getState().isPro).toBe(true);
      expect(usePaywallStore.getState().tier).toBe(tier);
    }
  );

  it("hydrate restores a valid persisted tier and derives isPro", async () => {
    await AsyncStorage.setItem(PAYWALL_KEY, JSON.stringify({ tier: "annual" }));
    await usePaywallStore.getState().hydrate();
    const state = usePaywallStore.getState();
    expect(state.tier).toBe("annual");
    expect(state.isPro).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  const invalidTiers: [string, unknown][] = [
    ["an unknown string", "pro"],
    ["null", null],
    ["a number", 1],
  ];

  it.each(invalidTiers)(
    "hydrate falls back to free (and isPro false) for invalid tier (%s)",
    async (_desc, rawTier) => {
      await AsyncStorage.setItem(PAYWALL_KEY, JSON.stringify({ tier: rawTier }));
      await usePaywallStore.getState().hydrate();
      const state = usePaywallStore.getState();
      expect(state.tier).toBe("free");
      expect(state.isPro).toBe(false);
      expect(state.isLoading).toBe(false);
    }
  );

  // Regression: the allow-list check this replaced read `data.tier` off whatever
  // came back, so a literal `null` threw out of hydrate() — and because the throw
  // escaped, isLoading stayed true forever behind a stuck spinner.
  it("hydrate survives a persisted null container and clears isLoading", async () => {
    await AsyncStorage.setItem(PAYWALL_KEY, "null");
    await expect(usePaywallStore.getState().hydrate()).resolves.toBeUndefined();
    const state = usePaywallStore.getState();
    expect(state.tier).toBe("free");
    expect(state.isPro).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it("hydrate with no stored key defaults to free and clears isLoading", async () => {
    await usePaywallStore.getState().hydrate();
    const state = usePaywallStore.getState();
    expect(state.tier).toBe("free");
    expect(state.isPro).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});
