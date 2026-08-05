import { tierFromProductIdentifier } from "./entitlement";
import type { PaywallOffering, PaywallPackage } from "./types";
import type { SubscriptionTier } from "../../types";

/**
 * The introductory-offer fields this module reads, as plain data.
 *
 * A structural subset of RevenueCat's `PurchasesIntroPrice`. Both spellings of
 * the duration are present because providers populate them inconsistently:
 * `periodNumberOfUnits` + `periodUnit` is the reliable pair, `period` is an
 * ISO-8601 duration ("P1W", "P7D") used as the fallback.
 */
export type IntroPriceSnapshot = {
  price: number;
  priceString: string;
  /** ISO-8601 duration, e.g. "P1W". Fallback for the pair below. */
  period?: string | null;
  /** How many times the introductory period repeats. Usually 1. */
  cycles?: number | null;
  /** "DAY" | "WEEK" | "MONTH" | "YEAR", casing not guaranteed. */
  periodUnit?: string | null;
  periodNumberOfUnits?: number | null;
};

/** The `PurchasesPackage` fields this module reads, as plain data. */
export type PackageSnapshot = {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    priceString: string;
    price: number;
    currencyCode: string;
    introPrice?: IntroPriceSnapshot | null;
  };
};

/**
 * The provider's standard package slots. RevenueCat populates `packageType` from
 * the dashboard's `$rc_monthly` / `$rc_annual` / `$rc_lifetime` slots, and it is
 * the field the SDK's own typed accessors key on — so it is tried first.
 */
const PACKAGE_TYPE_TIERS: Record<string, SubscriptionTier> = {
  MONTHLY: "monthly",
  ANNUAL: "annual",
  LIFETIME: "lifetime",
};

const UNIT_LABELS: Record<string, string> = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/**
 * Parses an ISO-8601 duration of the shape providers emit — `P1W`, `P7D`,
 * `P1M`, `P1Y`. Returns null on anything else rather than guessing.
 *
 * Deliberately narrow: this is a display fallback, and a wrong duration on a
 * paywall is worse than no duration at all.
 */
function parseIsoDuration(period: string): { value: number; unit: string } | null {
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(period);
  if (!match) return null;

  const [, years, months, weeks, days] = match;

  // Most-specific first: a "P1W" carries only the week group, so ordering only
  // matters for malformed compound values, where the smallest unit is the
  // safer thing to advertise.
  if (days) return { value: Number(days), unit: "day" };
  if (weeks) return { value: Number(weeks), unit: "week" };
  if (months) return { value: Number(months), unit: "month" };
  if (years) return { value: Number(years), unit: "year" };

  return null;
}

/**
 * Renders an introductory offer as short display copy, or null when the product
 * has none.
 *
 * Two shapes, because the stores sell two things:
 * - A free trial (`price === 0`) → "7 days free".
 * - A discounted introductory price → "$0.99 for the first month".
 *
 * `price === 0` is the only free-trial test used here. The obvious alternative —
 * comparing `priceString` against "$0.00" — is wrong in every storefront that
 * does not use that format, which is most of them.
 *
 * Returns null rather than a partial string whenever the duration cannot be
 * determined: a paywall that says "free trial" without saying how long is an
 * App Store Guideline 3.1.2 problem, and null falls back to showing the price
 * alone, which is always honest.
 */
export function parseIntroOffer(intro: IntroPriceSnapshot | null | undefined): string | null {
  if (!intro) return null;

  const cycles = intro.cycles && intro.cycles > 0 ? intro.cycles : 1;

  let value: number | null = null;
  let unit: string | null = null;

  if (intro.periodNumberOfUnits && intro.periodUnit) {
    const label = UNIT_LABELS[intro.periodUnit.toUpperCase()];
    if (label) {
      value = intro.periodNumberOfUnits;
      unit = label;
    }
  }

  if (value === null && intro.period) {
    const parsed = parseIsoDuration(intro.period);
    if (parsed) {
      value = parsed.value;
      unit = parsed.unit;
    }
  }

  if (value === null || unit === null) return null;

  const duration = pluralize(value * cycles, unit);
  return intro.price === 0 ? `${duration} free` : `${intro.priceString} for the first ${duration}`;
}

/**
 * Picks the package that satisfies `tier`, or null.
 *
 * `packageType` first (the provider's own standard slots), then the product
 * identifier — so a dashboard using custom package identifiers still resolves,
 * and it resolves through the same `tierFromProductIdentifier` the entitlement
 * mapping uses.
 *
 * Returning null rather than throwing keeps this pure: the adapter turns null
 * into `PaywallError("not_configured", …)` with a message naming the tier and
 * the offering, which is a message only the adapter can write.
 */
export function selectPackage<T extends PackageSnapshot>(
  packages: readonly T[],
  tier: SubscriptionTier,
  productTiers: Readonly<Record<string, SubscriptionTier>> = {}
): T | null {
  const byType = packages.find((p) => PACKAGE_TYPE_TIERS[p.packageType.toUpperCase()] === tier);
  if (byType) return byType;

  return (
    packages.find((p) => tierFromProductIdentifier(p.product.identifier, productTiers) === tier) ??
    null
  );
}

/**
 * Maps a provider's offering onto the port's display shape.
 *
 * Packages that resolve to no tier this app sells are dropped: rendering a card
 * with no working button is worse than rendering nothing, because `purchase()`
 * would then throw `not_configured` on a tier the screen itself offered.
 */
export function toOffering(
  id: string,
  packages: readonly PackageSnapshot[],
  productTiers: Readonly<Record<string, SubscriptionTier>> = {}
): PaywallOffering {
  const mapped: PaywallPackage[] = [];

  for (const pkg of packages) {
    const tier =
      PACKAGE_TYPE_TIERS[pkg.packageType.toUpperCase()] ??
      tierFromProductIdentifier(pkg.product.identifier, productTiers);
    if (!tier) continue;

    mapped.push({
      id: pkg.identifier,
      tier,
      priceString: pkg.product.priceString,
      price: pkg.product.price,
      currencyCode: pkg.product.currencyCode,
      introOffer: parseIntroOffer(pkg.product.introPrice),
    });
  }

  return { id, packages: mapped };
}
