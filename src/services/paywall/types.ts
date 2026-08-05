import { z } from "zod";
import { subscriptionTierSchema } from "../../types/schemas";
import type { SubscriptionTier } from "../../types";

/**
 * The user's current entitlement, provider-neutral.
 *
 * RevenueCat, Adapty, and a hand-rolled StoreKit bridge all expose these five
 * facts in some shape, and nothing above this layer should have to know which
 * one is in use.
 *
 * The schema is the source of truth — it doubles as the validator for the
 * persisted blob, so the type and the guard can't drift apart. It lives here
 * rather than in `types/schemas.ts` because it is paywall-domain, the same
 * reasoning `authSessionSchema` gives.
 *
 * `tier` is deliberately not the whole story. A store carrying only the tier
 * cannot tell "renewing" from "cancelled but still inside the paid period", and
 * cannot render "Trial ends Friday" — both of which a settings screen and a
 * paywall need. `isPro` is NOT a field here: it is derived from `tier` in
 * exactly one place (`isEntitled` below) so two call sites cannot disagree.
 */
export const paywallSubscriptionSchema = z.object({
  tier: subscriptionTierSchema,
  /**
   * Epoch **seconds**, matching `AuthSession.expiresAt` and JWT `exp`. Null for
   * `lifetime`, for promotional grants, and for `free`.
   */
  expiresAt: z.number().nullable(),
  /** False once the user cancels — they keep access until `expiresAt`. */
  willRenew: z.boolean(),
  /** True during a free trial or an introductory-price period. */
  isTrial: z.boolean(),
  /**
   * The store product that granted this. Null for `free`. Diagnostics only —
   * never branch entitlement on it; branch on `tier`.
   */
  productId: z.string().nullable(),
});

export type PaywallSubscription = z.infer<typeof paywallSubscriptionSchema>;

/**
 * The one canonical "nothing purchased" value.
 *
 * Frozen because it is shared: a caller that mutated it would be granting
 * itself access through every other call site at once.
 */
export const FREE_SUBSCRIPTION: PaywallSubscription = Object.freeze({
  tier: "free",
  expiresAt: null,
  willRenew: false,
  isTrial: false,
  productId: null,
});

/**
 * Storage-boundary variant: every field falls back independently, mirroring
 * `storedNotificationPrefsSchema`.
 *
 * This is also the migration path. Devices in the field hold a bare
 * `{ tier: "annual" }` written by the pre-port store, and per-field `.catch()`
 * means that blob parses to a complete, correct subscription rather than being
 * discarded — which would downgrade a paying user to free on the update that
 * ships this.
 */
export const storedSubscriptionSchema = z.object({
  tier: subscriptionTierSchema.catch("free"),
  expiresAt: z.number().nullable().catch(null),
  willRenew: z.boolean().catch(false),
  isTrial: z.boolean().catch(false),
  productId: z.string().nullable().catch(null),
});

/** The single gate for paid features. Never write `tier !== "free"` yourself. */
export function isEntitled(subscription: PaywallSubscription): boolean {
  return subscription.tier !== "free";
}

/**
 * One purchasable product, already localized by the store.
 *
 * This exists so `app/paywall.tsx` can render real prices without importing a
 * purchase SDK. The alternative — the screen reading prices off the SDK
 * directly — reintroduces the exact coupling this port exists to remove.
 */
export type PaywallPackage = {
  /** The provider's package identifier (RevenueCat: `$rc_annual`, or custom). */
  id: string;
  tier: SubscriptionTier;
  /**
   * Storefront-localized and ready to render — "$29.99", "29,99 €", "¥3,000".
   *
   * Never format this yourself. Currency, decimal separator, and symbol
   * placement are the store's job and differ per storefront; a hardcoded "$"
   * is wrong in most of the world and is an App Store Guideline 3.1.2 problem.
   */
  priceString: string;
  /** Raw amount in `currencyCode`, for analytics only. Do not render. */
  price: number;
  currencyCode: string;
  /**
   * Localized free-trial or intro-offer copy, e.g. "7 days free". Null when the
   * product has no offer *or* when this user is not eligible for it — so a
   * screen that renders it never promises a trial the store will not honour.
   */
  introOffer: string | null;
};

export type PaywallOffering = {
  id: string;
  packages: PaywallPackage[];
};

export type PaywallErrorCode =
  /**
   * No paywall provider is wired yet — the local scaffold throws this for every
   * call that would need a store.
   */
  | "not_wired"
  /** User dismissed the StoreKit / Play sheet. Not a failure. */
  | "cancelled"
  /**
   * The store says this product is already owned by this account. No new
   * entitlement was granted by *this* call, so it is not a success — the UI must
   * say "you already own this, tap Restore", not "something went wrong".
   */
  | "already_owned"
  /**
   * Structurally cannot be purchased by this account: family sharing, parental
   * controls, storefront restrictions, or a product withdrawn from sale.
   * Distinct from `store_problem` because retrying will never work, and
   * "try again" is a lie.
   */
  | "ineligible"
  /**
   * Ask-to-Buy, SCA, or a slow Play payment method. **Neither success nor
   * failure.** The purchase may complete minutes or days later and will arrive
   * out-of-band through `subscribe()`. The UI must dismiss the sheet, say
   * "we'll unlock this the moment your payment is approved", grant nothing, and
   * show no error styling. This is the branch that is most often wrong.
   */
  | "payment_pending"
  /** Could not reach the store or the provider's backend. */
  | "network"
  /**
   * The store or the provider is having a bad day — a retry later is genuinely
   * the right advice, and this must not read to the user as "card declined".
   */
  | "store_problem"
  /**
   * The adapter is installed but its *configuration* is wrong: a bad API key, no
   * `current` offering, or no package matching the requested tier. A developer
   * error, not a user error — and distinct from `not_wired`, where there is no
   * adapter at all. It earns its own code because the fix is in App Store
   * Connect or the provider's dashboard, and misconfiguration is the number-one
   * support burden of any template's IAP integration.
   */
  | "not_configured"
  | "unknown";

/**
 * The single error type every provider must throw, so screens can branch on
 * `code` instead of string-matching provider-specific messages.
 */
export class PaywallError extends Error {
  readonly code: PaywallErrorCode;
  readonly cause?: unknown;

  constructor(code: PaywallErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "PaywallError";
    this.code = code;
    this.cause = cause;
  }
}

/**
 * The port every paywall backend implements. Swapping RevenueCat for Adapty,
 * Superwall, or a hand-rolled StoreKit bridge means writing one of these —
 * `usePaywallStore` and `app/paywall.tsx` stay untouched.
 *
 * Rules for implementers:
 * - Throw `PaywallError` (never a raw SDK error) from every method.
 * - `getSubscription()` must never throw, and must never downgrade on doubt.
 *   See its own doc below — that rule is the *inverse* of
 *   `AuthProvider.getSession()`'s and is the most load-bearing line in this file.
 * - `restore()` resolving `FREE_SUBSCRIPTION` is a successful answer, not an
 *   error. See its doc.
 * - Throw `PaywallError("cancelled")` when the user dismisses the purchase
 *   sheet. The store swallows it, so nothing is shown for a tap the user
 *   deliberately took back.
 * - Never grant entitlement from the tier the *caller* asked for. Always return
 *   what the store actually reports afterwards: a user can be upgraded, or land
 *   on a different plan than the button they pressed, and the store wins.
 * - `subscribe()` must return its own unsubscribe function.
 * - Methods must not depend on `this`. Providers may be composed by object
 *   spread, which would not carry a bound receiver.
 */
export type PaywallProvider = {
  /** Identifies the active provider in logs and dev tooling. */
  readonly name: string;

  /**
   * The user's current entitlement, read at boot. `usePaywallStore.hydrate()`
   * calls this behind the splash screen.
   *
   * Two rules, and both are the OPPOSITE of `AuthProvider.getSession()`. The
   * asymmetry is deliberate, and copying the auth contract here is the trap:
   *
   * 1. **Never downgrade on doubt.** If you cannot reach the store, return the
   *    last known subscription. Do NOT return `free`. RevenueCat's SDK caches
   *    `CustomerInfo` and serves it offline; `local.ts` is a plain AsyncStorage
   *    read. A paying user on a plane keeps Pro.
   *
   * 2. **Never throw.** Not for network, not for anything. Resolve
   *    `FREE_SUBSCRIPTION` when there is genuinely nothing cached and nothing
   *    reachable.
   *
   * Why the inversion. `getSession()` throws `network` so the store can block on
   * a retry screen, because trusting an unverified session is a security hole.
   * Here the risk points the other way: the failure mode is revoking access
   * someone paid for. And unlike auth, being wrong is cheap and
   * self-correcting — `subscribe()` delivers the truth the moment the device is
   * online, and "Restore purchases" is the documented user-facing remedy. A
   * boot-blocking retry screen for a *paywall* would gate the entire app on a
   * feature most users never touch.
   *
   * The residual case — bought on device A, fresh install on device B while
   * offline — resolves `free` and shows the paywall. That is accepted: there is
   * no local evidence of a purchase to protect, and Restore fixes it.
   */
  getSubscription(): Promise<PaywallSubscription>;

  /**
   * The current offering's localized packages, for display.
   *
   * Returns null when there is nothing to sell: no provider wired, no `current`
   * offering configured, or an offering with no packages. Null is an answer, not
   * a failure — `app/paywall.tsx` falls back to placeholder copy. Same shape as
   * `AuthProvider.signUp()` resolving null, not the optional-method precedent.
   *
   * MAY throw `network` / `store_problem`: this is a foreground fetch behind a
   * visible loading state, so the screen can retry.
   *
   * Do NOT call this from `hydrate()`. It is a store round-trip in front of the
   * splash screen for every user, including the majority who never open the
   * paywall.
   */
  getOfferings(): Promise<PaywallOffering | null>;

  /**
   * Runs the store's purchase flow for `tier` and resolves the subscription the
   * store reports **afterwards** — which may differ from `tier`.
   *
   * Throws `cancelled` (swallowed upstream), `payment_pending` (grant nothing —
   * see that code's doc), `already_owned`, `ineligible`, or `not_configured`
   * when no package matches `tier`.
   */
  purchase(tier: SubscriptionTier): Promise<PaywallSubscription>;

  /**
   * Re-reads entitlements from the underlying store account (Apple ID / Google
   * account) and resolves whatever it finds.
   *
   * Three rules:
   *
   * 1. **`FREE_SUBSCRIPTION` is a success.** A user who taps "Restore" having
   *    never bought anything is the common case — they are checking. Throwing
   *    there paints a red alert over a correct answer. Callers distinguish by
   *    inspecting the result, not by catching.
   * 2. **MUST throw `network` when offline** — unlike `getSubscription()`. This
   *    is a user-initiated action behind a spinner; silently resolving `free`
   *    would tell a paying user they own nothing, which is the worst possible
   *    outcome of a button labelled "Restore purchases".
   * 3. **MUST work without an app account.** App Review requires a restore path
   *    for any non-consumable or auto-renewable purchase, and rejects apps that
   *    put it behind a login.
   */
  restore(): Promise<PaywallSubscription>;

  /**
   * Observe out-of-band entitlement changes: a renewal, an expiry, a billing
   * grace period ending, a purchase made on another device, or a deferred
   * (Ask-to-Buy) purchase finally being approved.
   *
   * That last one is not optional. `payment_pending` has no other resolution
   * path — without this subscription the user is charged and never unlocked.
   *
   * Returns its unsubscribe.
   */
  subscribe(onChange: (subscription: PaywallSubscription) => void): () => void;

  /**
   * Optional. Binds store entitlements to an app account so they follow the user
   * across devices and reinstalls.
   *
   * A provider that omits these operates in anonymous mode: entitlements are
   * tied to the device's store account only. That is correct for an app with no
   * auth — and dangerous for one with auth, because on a shared device the next
   * person to sign in inherits the previous user's Pro.
   *
   * `identify()` must be safe to call repeatedly with the same id.
   * `forget()` must NOT revoke a purchase — it returns the provider to anonymous
   * mode; the store account still owns what it bought.
   */
  identify?(appUserId: string): Promise<void>;
  forget?(): Promise<void>;
};

/**
 * Validates a subscription read back from storage. Persisted blobs are untrusted
 * input — a partial write or an older app version can leave a malformed shape.
 *
 * `local.ts` reads through `loadJson(key, fallback, schema)` and doesn't need
 * this; it stays because it is exported from the barrel and a downstream app may
 * want it.
 */
export function isValidSubscription(value: unknown): value is PaywallSubscription {
  return paywallSubscriptionSchema.safeParse(value).success;
}
