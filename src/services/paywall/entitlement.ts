import { FREE_SUBSCRIPTION } from "./types";
import type { PaywallSubscription } from "./types";
import type { SubscriptionTier } from "../../types";

/**
 * The fields of a provider's entitlement record that this mapping reads,
 * restated as plain data.
 *
 * Declared here rather than imported from an SDK so this module — the
 * highest-risk logic in the feature — lives under `src/services/`, where tsc,
 * eslint and jest can all see it. `templates/` gets none of the three. Same rule
 * that pulled `oauthCallback.ts` and `appleName.ts` out of `templates/social/`.
 *
 * It is a structural subset of RevenueCat's `PurchasesEntitlementInfo`, so the
 * SDK's own type assigns to it directly and the adapter needs no translation
 * step to call this.
 */
export type EntitlementSnapshot = {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  periodType: string;
  productIdentifier: string;
  /** ISO-8601 string, as RevenueCat emits. Null for lifetime / promotional. */
  expirationDate: string | null;
  latestPurchaseDate: string;
};

/**
 * Recognised tier tokens in a product identifier's segments.
 *
 * Both spellings of the yearly plan are accepted: RevenueCat's own sample
 * projects use `.yearly` while this template's copy says "Annual".
 */
const SUFFIX_TIERS: Record<string, SubscriptionTier> = {
  monthly: "monthly",
  month: "monthly",
  annual: "annual",
  yearly: "annual",
  year: "annual",
  lifetime: "lifetime",
  forever: "lifetime",
};

/**
 * Resolves a store product identifier to a tier, or null when neither the
 * author's map nor the naming convention recognises it.
 *
 * Shared with `offerings.ts`, which needs the same answer for a purchasable
 * package. Keeping one implementation means a product the paywall offers as
 * "Annual" cannot come back from the store labelled "Monthly".
 */
export function tierFromProductIdentifier(
  productIdentifier: string,
  productTiers: Readonly<Record<string, SubscriptionTier>> = {}
): SubscriptionTier | null {
  const mapped = productTiers[productIdentifier];
  if (mapped !== undefined) return mapped;

  // Play appends a base-plan id after a colon (`sub_pro:annual-autorenewing`),
  // so split on both separators and scan from the end — the tier token is the
  // trailing part of every convention worth supporting, and a bundle-id prefix
  // like `com.month.app` must not win over the real suffix.
  const tokens = productIdentifier.toLowerCase().split(/[.:_-]/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const bySuffix = SUFFIX_TIERS[tokens[i]];
    if (bySuffix !== undefined) return bySuffix;
  }

  return null;
}

const DAY_MS = 86_400_000;

/**
 * 45 days splits a monthly plan (28–31) from every longer one with wide margin
 * on both sides, and absorbs the store's own grace-period padding.
 */
const MONTHLY_MAX_DAYS = 45;

/**
 * Resolves an active entitlement to one of the template's four tiers.
 *
 * A provider's model is *entitlements* — "this user may use the pro features".
 * The template's `tier` is really "which SKU is active", which providers
 * deliberately abstract away. So this reads the two questions off different
 * fields, most-trusted first:
 *
 * 1. Not active → `free`. The only path to `free`.
 * 2. No expiry → `lifetime`. A non-consumable or a promotional grant; both are
 *    correctly described as lifetime access.
 * 3. Exact match in `productTiers` — the map the app author edits at the top of
 *    their adapter. Authoritative, because it is the one place that actually
 *    knows.
 * 4. A recognised token in the product identifier
 *    (`com.example.app.pro.annual` → annual). Makes the map optional for anyone
 *    following the recommended naming.
 * 5. Duration between purchase and expiry, but ONLY outside a trial or intro
 *    period. A 7-day trial on an annual product expires in 7 days; classifying
 *    on that would label every trialist "monthly".
 * 6. `monthly`.
 *
 * **The invariant that matters: an active entitlement NEVER resolves to `free`.**
 * A mislabeled tier costs a wrong row in the settings screen. A wrongly-`free`
 * tier costs a paying user their access. Step 6 exists solely to make that
 * unreachable, and there is a test asserting it for every unrecognised input.
 *
 * Deliberately NOT read here: `willRenew` (cancel state, not duration), `store`
 * (`APP_STORE` / `PROMOTIONAL` — not a tier), and `periodType` beyond gating
 * step 5 (it is a pricing phase, not a duration).
 */
export function resolveTier(
  entitlement: EntitlementSnapshot,
  productTiers: Readonly<Record<string, SubscriptionTier>> = {}
): SubscriptionTier {
  if (!entitlement.isActive) return "free";
  if (entitlement.expirationDate === null) return "lifetime";

  const byProductId = tierFromProductIdentifier(entitlement.productIdentifier, productTiers);
  if (byProductId !== null) return byProductId;

  if (entitlement.periodType.toUpperCase() === "NORMAL") {
    const days =
      (Date.parse(entitlement.expirationDate) - Date.parse(entitlement.latestPurchaseDate)) / DAY_MS;
    if (Number.isFinite(days)) return days > MONTHLY_MAX_DAYS ? "annual" : "monthly";
  }

  return "monthly";
}

/**
 * Builds the port's subscription from an entitlement, or `free` from `null`.
 *
 * A provider passes `customerInfo.entitlements.active[ENTITLEMENT_ID]` straight
 * in — absent means not entitled, which is exactly the `undefined` case.
 */
export function toSubscription(
  entitlement: EntitlementSnapshot | null | undefined,
  productTiers: Readonly<Record<string, SubscriptionTier>> = {}
): PaywallSubscription {
  if (!entitlement || !entitlement.isActive) return FREE_SUBSCRIPTION;

  const expiry = entitlement.expirationDate === null ? NaN : Date.parse(entitlement.expirationDate);

  return {
    tier: resolveTier(entitlement, productTiers),
    // Epoch **seconds**, matching AuthSession.expiresAt and JWT `exp`. Forgetting
    // the /1000 here makes every subscription look valid for 50 millennia — the
    // mirror of the bug supabase.test.ts guards with its "passes expires_at
    // through as seconds" case.
    expiresAt: Number.isNaN(expiry) ? null : Math.floor(expiry / 1000),
    willRenew: entitlement.willRenew,
    // INTRO covers a discounted introductory period, TRIAL a free one. Both are
    // "not yet paying full price", which is what a paywall and a settings screen
    // need to say.
    isTrial: ["TRIAL", "INTRO"].includes(entitlement.periodType.toUpperCase()),
    productId: entitlement.productIdentifier,
  };
}
