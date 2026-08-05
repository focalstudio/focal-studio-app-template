import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  localPaywallProvider,
  seedLocalSubscription,
  clearLocalSubscription,
} from "../local";
import { FREE_SUBSCRIPTION, PaywallError } from "../types";
import { STORAGE_PREFIX } from "../../../constants";
import type { PaywallSubscription } from "../types";

/**
 * Tests the no-provider scaffold directly.
 *
 * Imports `../local` rather than the barrel for the same reason
 * `services/auth/__tests__/local.test.ts` does: once `scripts/add-paywall.sh`
 * swaps the barrel's export, the store no longer talks to this provider, and
 * every assertion here would become false in any app that wired RevenueCat.
 * Importing the module directly also keeps this suite free of an adapter's
 * native imports, which cannot load under Jest.
 */

const SUBSCRIPTION_KEY = `${STORAGE_PREFIX}subscription`;

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

describe("localPaywallProvider — the read path", () => {
  it("resolves the free subscription when nothing is stored", async () => {
    await expect(localPaywallProvider.getSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });

  it("restores a valid persisted subscription", async () => {
    await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(paid));
    await expect(localPaywallProvider.getSubscription()).resolves.toEqual(paid);
  });

  /*
   * The migration case. A device updating into this version holds a bare
   * `{ tier }` blob written by the pre-port store. It must read back as that
   * tier — discarding it would downgrade a paying user on upgrade day.
   */
  it("completes a legacy bare-tier blob rather than discarding it", async () => {
    await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify({ tier: "lifetime" }));
    await expect(localPaywallProvider.getSubscription()).resolves.toEqual({
      ...FREE_SUBSCRIPTION,
      tier: "lifetime",
    });
  });

  const malformed: [string, string][] = [
    ["a literal null", "null"],
    ["a bare string", '"annual"'],
    ["an array", "[]"],
    ["a number", "7"],
    ["unparseable JSON", "{tier:"],
  ];

  it.each(malformed)("falls back to free for %s", async (_desc, raw) => {
    await AsyncStorage.setItem(SUBSCRIPTION_KEY, raw);
    await expect(localPaywallProvider.getSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });

  /*
   * Rule 2 of the port contract, and the inverse of AuthProvider.getSession().
   * A read that threw would let a paywall failure trap app boot.
   */
  it("never throws, whatever is in storage", async () => {
    await AsyncStorage.setItem(SUBSCRIPTION_KEY, "{tier:");
    await expect(localPaywallProvider.getSubscription()).resolves.toBeDefined();
  });
});

describe("localPaywallProvider — the store path", () => {
  it("returns null offerings rather than throwing, so the screen stays renderable", async () => {
    await expect(localPaywallProvider.getOfferings()).resolves.toBeNull();
  });

  it.each([
    ["purchase", () => localPaywallProvider.purchase("annual")],
    ["restore", () => localPaywallProvider.restore()],
  ])("%s throws not_wired", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: "not_wired" });
    await expect(call()).rejects.toBeInstanceOf(PaywallError);
  });

  it("names the exact command to run in the not_wired message", async () => {
    await expect(localPaywallProvider.purchase("annual")).rejects.toThrow(/add-paywall\.sh/);
  });

  /*
   * restore() resolving free would be a lie with the shape of a fact — "we
   * checked your Apple ID and you own nothing". There is nothing here that can
   * check, so it says so.
   */
  it("restore throws rather than resolving free", async () => {
    await expect(localPaywallProvider.restore()).rejects.toThrow();
  });

  it("subscribe returns its own no-op unsubscribe", () => {
    const unsubscribe = localPaywallProvider.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  // Their absence is contract, not oversight: the scaffold has no store account
  // to bind, and omitting them lets the store skip the call rather than pretend.
  it.each(["identify", "forget"] as const)("does not implement %s", (method) => {
    expect(localPaywallProvider[method]).toBeUndefined();
  });

  it("is named so logs and dev tooling can identify it", () => {
    expect(localPaywallProvider.name).toBe("local");
  });

  // Providers may be composed by object spread, which would not carry a bound
  // receiver — the same rule the auth port states.
  it("has methods that do not depend on `this`", async () => {
    const { getSubscription } = localPaywallProvider;
    await expect(getSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });
});

describe("seedLocalSubscription", () => {
  it("puts the app into an entitled state without a store", async () => {
    await seedLocalSubscription();
    await expect(localPaywallProvider.getSubscription()).resolves.toMatchObject({ tier: "annual" });
  });

  it("accepts an explicit subscription", async () => {
    await seedLocalSubscription(paid);
    await expect(localPaywallProvider.getSubscription()).resolves.toEqual(paid);
  });

  it("clearLocalSubscription returns to the free state", async () => {
    await seedLocalSubscription();
    await clearLocalSubscription();
    await expect(localPaywallProvider.getSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });
});
