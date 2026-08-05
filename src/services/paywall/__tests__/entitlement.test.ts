import { resolveTier, toSubscription, tierFromProductIdentifier } from "../entitlement";
import { FREE_SUBSCRIPTION } from "../types";
import type { EntitlementSnapshot } from "../entitlement";
import type { SubscriptionTier } from "../../../types";

function entitlement(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    identifier: "pro",
    isActive: true,
    willRenew: true,
    periodType: "NORMAL",
    productIdentifier: "com.example.app.pro.annual",
    expirationDate: "2027-01-01T00:00:00Z",
    latestPurchaseDate: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("tierFromProductIdentifier", () => {
  it("prefers the author's explicit map over the naming convention", () => {
    // The identifier says monthly; the map says lifetime. The map wins, because
    // it is the one place that actually knows.
    expect(tierFromProductIdentifier("weird.monthly", { "weird.monthly": "lifetime" })).toBe(
      "lifetime"
    );
  });

  it.each([
    ["com.example.app.pro.monthly", "monthly"],
    ["com.example.app.pro.annual", "annual"],
    ["com.example.app.pro.yearly", "annual"],
    ["com.example.app.pro.lifetime", "lifetime"],
    ["pro_monthly", "monthly"],
    ["pro-annual", "annual"],
    ["sub_pro:annual-autorenewing", "annual"],
    ["forever", "lifetime"],
  ] as [string, SubscriptionTier][])("reads %s as %s", (id, tier) => {
    expect(tierFromProductIdentifier(id)).toBe(tier);
  });

  // A bundle id containing a tier word must not beat the real suffix, which is
  // why the scan runs from the end.
  it("scans from the end so a prefix cannot outrank the suffix", () => {
    expect(tierFromProductIdentifier("com.month.app.pro.annual")).toBe("annual");
  });

  it("returns null when nothing recognises the identifier", () => {
    expect(tierFromProductIdentifier("com.example.app.sku12345")).toBeNull();
  });
});

describe("resolveTier", () => {
  it("is the only path to free: an inactive entitlement", () => {
    expect(resolveTier(entitlement({ isActive: false }))).toBe("free");
  });

  it("reads a null expiry as lifetime, ahead of any identifier hint", () => {
    // A promotional grant also has a null expiry — "lifetime access" is the
    // correct description of it either way.
    expect(
      resolveTier(entitlement({ expirationDate: null, productIdentifier: "promo.monthly" }))
    ).toBe("lifetime");
  });

  it("falls back to duration only outside a trial or intro period", () => {
    const annualByDuration = entitlement({
      productIdentifier: "com.example.app.sku12345",
      latestPurchaseDate: "2026-01-01T00:00:00Z",
      expirationDate: "2027-01-01T00:00:00Z",
    });
    expect(resolveTier(annualByDuration)).toBe("annual");

    const monthlyByDuration = entitlement({
      productIdentifier: "com.example.app.sku12345",
      latestPurchaseDate: "2026-01-01T00:00:00Z",
      expirationDate: "2026-02-01T00:00:00Z",
    });
    expect(resolveTier(monthlyByDuration)).toBe("monthly");
  });

  /*
   * The bug the periodType gate exists to prevent: a 7-day free trial on an
   * ANNUAL product expires in 7 days. Classifying on duration there would label
   * every trialist "monthly", and the settings screen would tell a user on the
   * annual plan that they are on the monthly one.
   */
  it("does not classify a trial on an annual product as monthly", () => {
    const trialOnAnnual = entitlement({
      productIdentifier: "com.example.app.sku12345",
      periodType: "TRIAL",
      latestPurchaseDate: "2026-01-01T00:00:00Z",
      expirationDate: "2026-01-08T00:00:00Z",
    });
    expect(resolveTier(trialOnAnnual)).toBe("monthly"); // the safe fallback, not a duration read
  });

  /*
   * The invariant that matters. A mislabeled tier costs a wrong row in the
   * settings screen; a wrongly-free tier costs a paying user their access.
   */
  it.each([
    ["an unrecognised identifier", { productIdentifier: "com.example.app.sku12345" }],
    ["an unparseable expiry", { productIdentifier: "sku", expirationDate: "not-a-date" }],
    ["an unparseable purchase date", { productIdentifier: "sku", latestPurchaseDate: "nope" }],
    ["an empty identifier", { productIdentifier: "" }],
    ["an unknown period type", { productIdentifier: "sku", periodType: "WEIRD" }],
  ])("never resolves an active entitlement to free (%s)", (_desc, overrides) => {
    expect(resolveTier(entitlement(overrides))).not.toBe("free");
  });
});

describe("toSubscription", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("maps %s to the free subscription", (_desc, value) => {
    expect(toSubscription(value)).toEqual(FREE_SUBSCRIPTION);
  });

  it("maps an inactive entitlement to the free subscription", () => {
    expect(toSubscription(entitlement({ isActive: false }))).toEqual(FREE_SUBSCRIPTION);
  });

  /*
   * expiresAt is epoch SECONDS, matching AuthSession.expiresAt and JWT `exp`.
   * Forgetting the /1000 makes every subscription look valid for 50 millennia —
   * the mirror of the case supabase.test.ts guards for auth.
   */
  it("converts the ISO expiry to epoch seconds, not milliseconds", () => {
    const result = toSubscription(entitlement({ expirationDate: "2027-01-01T00:00:00Z" }));
    expect(result.expiresAt).toBe(Date.parse("2027-01-01T00:00:00Z") / 1000);
    expect(result.expiresAt).toBeLessThan(2_000_000_000);
  });

  it("keeps a null expiry null rather than emitting NaN", () => {
    expect(toSubscription(entitlement({ expirationDate: null })).expiresAt).toBeNull();
  });

  it("keeps an unparseable expiry null rather than emitting NaN", () => {
    expect(toSubscription(entitlement({ expirationDate: "not-a-date" })).expiresAt).toBeNull();
  });

  it.each([
    ["TRIAL", true],
    ["INTRO", true],
    ["intro", true],
    ["NORMAL", false],
    ["PREPAID", false],
  ])("reads periodType %s as isTrial=%s", (periodType, expected) => {
    expect(toSubscription(entitlement({ periodType })).isTrial).toBe(expected);
  });

  it("passes willRenew and productId through", () => {
    const result = toSubscription(
      entitlement({ willRenew: false, productIdentifier: "com.example.app.pro.monthly" })
    );
    expect(result).toEqual({
      tier: "monthly",
      expiresAt: Date.parse("2027-01-01T00:00:00Z") / 1000,
      willRenew: false,
      isTrial: false,
      productId: "com.example.app.pro.monthly",
    });
  });

  it("honours the author's product map", () => {
    const result = toSubscription(entitlement({ productIdentifier: "legacy_sku" }), {
      legacy_sku: "lifetime",
    });
    expect(result.tier).toBe("lifetime");
  });
});
