import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SUBSCRIPTION_KEY,
  loadCachedSubscription,
  cacheSubscription,
  clearCachedSubscription,
} from "../cache";
import { FREE_SUBSCRIPTION } from "../types";
import { STORAGE_PREFIX } from "../../../constants";
import type { PaywallSubscription } from "../types";

const paid: PaywallSubscription = {
  tier: "annual",
  expiresAt: 1_800_000_000,
  willRenew: true,
  isTrial: false,
  productId: "com.example.app.pro.annual",
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("SUBSCRIPTION_KEY", () => {
  /*
   * Changing this key would strand every device that already holds a
   * subscription blob under the old one — they would all read back as free on
   * the update that changed it.
   */
  it("is the key the pre-port store already wrote to", () => {
    expect(SUBSCRIPTION_KEY).toBe(`${STORAGE_PREFIX}subscription`);
  });
});

describe("loadCachedSubscription", () => {
  it("resolves free when nothing is cached", async () => {
    await expect(loadCachedSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });

  it("round-trips through cacheSubscription", async () => {
    await cacheSubscription(paid);
    await expect(loadCachedSubscription()).resolves.toEqual(paid);
  });

  it("completes a legacy bare-tier blob", async () => {
    await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify({ tier: "monthly" }));
    await expect(loadCachedSubscription()).resolves.toEqual({
      ...FREE_SUBSCRIPTION,
      tier: "monthly",
    });
  });

  it.each([
    ["a literal null", "null"],
    ["unparseable JSON", "{"],
    ["an array", "[]"],
  ])("falls back to free for %s without throwing", async (_desc, raw) => {
    await AsyncStorage.setItem(SUBSCRIPTION_KEY, raw);
    await expect(loadCachedSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });
});

describe("clearCachedSubscription", () => {
  it("removes the cached entitlement", async () => {
    await cacheSubscription(paid);
    await clearCachedSubscription();
    await expect(loadCachedSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });

  it("is a no-op when nothing is cached", async () => {
    await expect(clearCachedSubscription()).resolves.toBeUndefined();
  });
});
