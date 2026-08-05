import {
  FREE_SUBSCRIPTION,
  PaywallError,
  isEntitled,
  isValidSubscription,
  paywallSubscriptionSchema,
  storedSubscriptionSchema,
} from "../types";
import type { PaywallSubscription } from "../types";

const paid: PaywallSubscription = {
  tier: "annual",
  expiresAt: 1_800_000_000,
  willRenew: true,
  isTrial: false,
  productId: "com.example.app.pro.annual",
};

describe("isEntitled", () => {
  it("is false only for the free tier", () => {
    expect(isEntitled(FREE_SUBSCRIPTION)).toBe(false);
  });

  it.each(["monthly", "annual", "lifetime"] as const)("is true for %s", (tier) => {
    expect(isEntitled({ ...FREE_SUBSCRIPTION, tier })).toBe(true);
  });
});

describe("FREE_SUBSCRIPTION", () => {
  it("is frozen so a caller cannot mutate the shared instance into granting access", () => {
    expect(Object.isFrozen(FREE_SUBSCRIPTION)).toBe(true);
    // Whether the write throws depends on the strict-mode setting of whatever
    // transpiled the caller, so that is not what is asserted. What matters is
    // that the write never takes: a mutated shared instance would grant access
    // through every other call site at once.
    (FREE_SUBSCRIPTION as { tier: string }).tier = "lifetime";
    expect(FREE_SUBSCRIPTION.tier).toBe("free");
  });
});

describe("isValidSubscription", () => {
  it("accepts a complete subscription", () => {
    expect(isValidSubscription(paid)).toBe(true);
    expect(isValidSubscription(FREE_SUBSCRIPTION)).toBe(true);
  });

  const malformed: [string, unknown][] = [
    ["null", null],
    ["a string", "annual"],
    ["an empty object", {}],
    ["an unknown tier", { ...paid, tier: "pro" }],
    ["an absent expiresAt key", { tier: "annual", willRenew: true, isTrial: false, productId: null }],
    ["a string expiresAt", { ...paid, expiresAt: "1800000000" }],
    ["an absent willRenew key", { tier: "annual", expiresAt: null, isTrial: false, productId: null }],
    ["a non-boolean isTrial", { ...paid, isTrial: "yes" }],
    ["a numeric productId", { ...paid, productId: 7 }],
  ];

  it.each(malformed)("rejects %s", (_desc, value) => {
    expect(isValidSubscription(value)).toBe(false);
  });

  // `.nullable()` and not `.optional()`: a subscription with either key absent is
  // malformed, not one with a default. Same rule authSessionSchema states.
  it("accepts explicit nulls but not absent keys", () => {
    expect(paywallSubscriptionSchema.safeParse({ ...paid, expiresAt: null }).success).toBe(true);
    const { expiresAt: _dropped, ...withoutExpiry } = paid;
    expect(paywallSubscriptionSchema.safeParse(withoutExpiry).success).toBe(false);
  });
});

describe("storedSubscriptionSchema", () => {
  it("round-trips a complete blob", () => {
    expect(storedSubscriptionSchema.parse(paid)).toEqual(paid);
  });

  /*
   * The migration case, and the reason every field carries its own `.catch()`.
   * Devices in the field hold a bare `{ tier }` written by the pre-port store.
   * A whole-object schema would reject that blob, the caller's fallback would
   * apply, and the update that shipped the port would silently downgrade every
   * paying user to free.
   */
  it("completes a legacy bare-tier blob instead of discarding it", () => {
    expect(storedSubscriptionSchema.parse({ tier: "annual" })).toEqual({
      tier: "annual",
      expiresAt: null,
      willRenew: false,
      isTrial: false,
      productId: null,
    });
  });

  it.each([
    ["an unknown string", "pro"],
    ["null", null],
    ["a number", 1],
    ["missing", undefined],
  ])("catches an invalid tier (%s) as free", (_desc, tier) => {
    expect(storedSubscriptionSchema.parse({ tier }).tier).toBe("free");
  });

  it("catches each other malformed field independently", () => {
    expect(
      storedSubscriptionSchema.parse({
        tier: "monthly",
        expiresAt: "soon",
        willRenew: "yes",
        isTrial: 1,
        productId: 7,
      })
    ).toEqual({
      tier: "monthly",
      expiresAt: null,
      willRenew: false,
      isTrial: false,
      productId: null,
    });
  });

  it("rejects a non-object container so the caller's fallback applies", () => {
    expect(storedSubscriptionSchema.safeParse(null).success).toBe(false);
  });
});

describe("PaywallError", () => {
  it("carries its code, name and cause", () => {
    const cause = new Error("raw sdk failure");
    const err = new PaywallError("payment_pending", "Awaiting approval", cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PaywallError");
    expect(err.code).toBe("payment_pending");
    expect(err.message).toBe("Awaiting approval");
    expect(err.cause).toBe(cause);
  });

  it("leaves cause undefined when none is given", () => {
    expect(new PaywallError("unknown", "boom").cause).toBeUndefined();
  });
});
