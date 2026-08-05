import { parseIntroOffer, selectPackage, toOffering } from "../offerings";
import type { PackageSnapshot } from "../offerings";

function pkg(overrides: Partial<PackageSnapshot> = {}): PackageSnapshot {
  return {
    identifier: "$rc_annual",
    packageType: "ANNUAL",
    product: {
      identifier: "com.example.app.pro.annual",
      priceString: "$29.99",
      price: 29.99,
      currencyCode: "USD",
      introPrice: null,
    },
    ...overrides,
  };
}

describe("parseIntroOffer", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("returns null for %s", (_desc, intro) => {
    expect(parseIntroOffer(intro)).toBeNull();
  });

  it("renders a free trial from the unit pair", () => {
    expect(
      parseIntroOffer({
        price: 0,
        priceString: "$0.00",
        periodNumberOfUnits: 7,
        periodUnit: "DAY",
        cycles: 1,
      })
    ).toBe("7 days free");
  });

  it("singularizes a one-unit period", () => {
    expect(
      parseIntroOffer({ price: 0, priceString: "$0.00", periodNumberOfUnits: 1, periodUnit: "WEEK" })
    ).toBe("1 week free");
  });

  it("multiplies the period by its cycle count", () => {
    expect(
      parseIntroOffer({
        price: 0,
        priceString: "$0.00",
        periodNumberOfUnits: 1,
        periodUnit: "MONTH",
        cycles: 3,
      })
    ).toBe("3 months free");
  });

  it("renders a discounted intro offer with its localized price", () => {
    expect(
      parseIntroOffer({
        price: 0.99,
        priceString: "0,99 €",
        periodNumberOfUnits: 1,
        periodUnit: "MONTH",
      })
    ).toBe("0,99 € for the first 1 month");
  });

  /*
   * price === 0 is the only free-trial test. The obvious alternative — comparing
   * priceString against "$0.00" — is wrong in every storefront that does not use
   * that format, which is most of them.
   */
  it("detects a free trial by price, not by the localized price string", () => {
    expect(
      parseIntroOffer({ price: 0, priceString: "0,00 €", periodNumberOfUnits: 7, periodUnit: "DAY" })
    ).toBe("7 days free");
  });

  it.each([
    ["P1W", "1 week free"],
    ["P7D", "7 days free"],
    ["P1M", "1 month free"],
    ["P1Y", "1 year free"],
    ["P3D", "3 days free"],
  ])("falls back to the ISO-8601 period %s", (period, expected) => {
    expect(parseIntroOffer({ price: 0, priceString: "$0.00", period })).toBe(expected);
  });

  it("prefers the unit pair over the ISO period when both are present", () => {
    expect(
      parseIntroOffer({
        price: 0,
        priceString: "$0.00",
        period: "P1Y",
        periodNumberOfUnits: 14,
        periodUnit: "DAY",
      })
    ).toBe("14 days free");
  });

  /*
   * A paywall that says "free trial" without saying how long is a Guideline
   * 3.1.2 problem. Null falls back to showing the price alone, which is always
   * honest.
   */
  it.each([
    ["an unrecognised unit", { price: 0, priceString: "$0", periodNumberOfUnits: 7, periodUnit: "FORTNIGHT" }],
    ["an unparseable ISO period", { price: 0, priceString: "$0", period: "7 days" }],
    ["no duration at all", { price: 0, priceString: "$0" }],
    ["a zero unit count", { price: 0, priceString: "$0", periodNumberOfUnits: 0, periodUnit: "DAY" }],
  ])("returns null rather than a partial string when the duration is unknown (%s)", (_d, intro) => {
    expect(parseIntroOffer(intro)).toBeNull();
  });
});

describe("selectPackage", () => {
  const packages = [
    pkg({ identifier: "$rc_monthly", packageType: "MONTHLY" }),
    pkg({ identifier: "$rc_annual", packageType: "ANNUAL" }),
    pkg({ identifier: "$rc_lifetime", packageType: "LIFETIME" }),
  ];

  it.each([
    ["monthly", "$rc_monthly"],
    ["annual", "$rc_annual"],
    ["lifetime", "$rc_lifetime"],
  ] as const)("picks the %s package by packageType", (tier, id) => {
    expect(selectPackage(packages, tier)?.identifier).toBe(id);
  });

  it("falls back to the product identifier for a custom package type", () => {
    const custom = [
      pkg({
        identifier: "my_yearly_deal",
        packageType: "CUSTOM",
        product: { ...pkg().product, identifier: "com.example.app.pro.yearly" },
      }),
    ];
    expect(selectPackage(custom, "annual")?.identifier).toBe("my_yearly_deal");
  });

  it("honours the author's product map for an opaque identifier", () => {
    const opaque = [
      pkg({
        identifier: "legacy",
        packageType: "CUSTOM",
        product: { ...pkg().product, identifier: "sku_12345" },
      }),
    ];
    expect(selectPackage(opaque, "lifetime", { sku_12345: "lifetime" })?.identifier).toBe("legacy");
  });

  // Null rather than a throw keeps this pure — the adapter writes the
  // `not_configured` message, because only it knows the offering's name.
  it("returns null when no package satisfies the tier", () => {
    expect(selectPackage([packages[0]], "lifetime")).toBeNull();
    expect(selectPackage([], "monthly")).toBeNull();
  });
});

describe("toOffering", () => {
  it("maps packages onto the port's display shape", () => {
    const result = toOffering("default", [
      pkg({
        identifier: "$rc_annual",
        packageType: "ANNUAL",
        product: {
          identifier: "com.example.app.pro.annual",
          priceString: "29,99 €",
          price: 29.99,
          currencyCode: "EUR",
          introPrice: { price: 0, priceString: "0,00 €", periodNumberOfUnits: 7, periodUnit: "DAY" },
        },
      }),
    ]);

    expect(result).toEqual({
      id: "default",
      packages: [
        {
          id: "$rc_annual",
          tier: "annual",
          priceString: "29,99 €",
          price: 29.99,
          currencyCode: "EUR",
          introOffer: "7 days free",
        },
      ],
    });
  });

  /*
   * Rendering a card with no working button is worse than rendering nothing:
   * purchase() would throw not_configured on a tier the screen itself offered.
   */
  it("drops packages that resolve to no tier this app sells", () => {
    const result = toOffering("default", [
      pkg({ identifier: "$rc_annual", packageType: "ANNUAL" }),
      pkg({
        identifier: "mystery",
        packageType: "CUSTOM",
        product: { ...pkg().product, identifier: "sku_98765" },
      }),
    ]);

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].id).toBe("$rc_annual");
  });

  it("returns an empty package list rather than throwing on an empty offering", () => {
    expect(toOffering("default", [])).toEqual({ id: "default", packages: [] });
  });

  it("carries a null introOffer when the product has no intro price", () => {
    expect(toOffering("default", [pkg()]).packages[0].introOffer).toBeNull();
  });
});
