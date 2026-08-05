import { PaywallError } from "./types";
import type { PaywallErrorCode } from "./types";

/**
 * The fields of a provider's thrown error this mapping reads, as plain data.
 *
 * A structural subset of RevenueCat's `PurchasesError`. `code` is typed loosely
 * because the SDK's `PURCHASES_ERROR_CODE` enum has string values that happen to
 * be numerals, and a raw bridge error can surface either.
 */
export type ErrorSnapshot = {
  code?: string | number | null;
  /** RevenueCat sets this on every purchase error. Checked before `code`. */
  userCancelled?: boolean | null;
  message?: string | null;
};

/**
 * RevenueCat's `PURCHASES_ERROR_CODE` values → this port's codes.
 *
 * Keys are the enum's string values as of react-native-purchases 10.6.0. This
 * table lives in `src/` rather than beside the adapter so tsc, eslint and jest
 * can see it — but that means it cannot import the enum to check itself against.
 * `templates/paywall/revenuecat.test.ts` closes that gap: it is the one test
 * that legitimately imports the SDK, and it asserts these keys against the real
 * enum. Pure logic gets CI coverage; enum conformance gets checked at the only
 * place it can be.
 *
 * Codes deliberately absent fall through to `unknown` — see `toPaywallError`.
 * They are the ones no paywall UI can act on differently (subscriber-attribute
 * errors, refund-request plumbing, promotional-offer construction).
 */
export const RC_ERROR_CODES: Readonly<Record<string, PaywallErrorCode>> = {
  "0": "unknown", // UNKNOWN_ERROR
  "1": "cancelled", // PURCHASE_CANCELLED_ERROR
  "2": "store_problem", // STORE_PROBLEM_ERROR
  "3": "ineligible", // PURCHASE_NOT_ALLOWED_ERROR — parental controls, device restrictions
  // PURCHASE_INVALID_ERROR covers both "your card was declined" and "you may not
  // buy this", and the SDK does not separate them. Mapped to the retryable side
  // deliberately: telling someone with a fixable payment problem that it will
  // never work is the worse of the two wrong answers.
  "4": "store_problem",
  "5": "ineligible", // PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR — withdrawn, or wrong storefront
  "6": "already_owned", // PRODUCT_ALREADY_PURCHASED_ERROR
  "7": "already_owned", // RECEIPT_ALREADY_IN_USE_ERROR — the receipt belongs to another account
  "8": "store_problem", // INVALID_RECEIPT_ERROR
  "9": "store_problem", // MISSING_RECEIPT_FILE_ERROR
  "10": "network", // NETWORK_ERROR
  "11": "not_configured", // INVALID_CREDENTIALS_ERROR — almost always a wrong API key
  "12": "store_problem", // UNEXPECTED_BACKEND_RESPONSE_ERROR
  "16": "store_problem", // UNKNOWN_BACKEND_ERROR
  "17": "not_configured", // INVALID_APPLE_SUBSCRIPTION_KEY_ERROR — the missing .p8
  "18": "ineligible", // INELIGIBLE_ERROR
  "19": "ineligible", // INSUFFICIENT_PERMISSIONS_ERROR
  "20": "payment_pending", // PAYMENT_PENDING_ERROR — Ask-to-Buy, SCA, slow Play methods
  "23": "not_configured", // CONFIGURATION_ERROR
  "24": "ineligible", // UNSUPPORTED_ERROR
  "32": "network", // PRODUCT_REQUEST_TIMED_OUT_ERROR
  "33": "network", // API_ENDPOINT_BLOCKED
  "35": "network", // OFFLINE_CONNECTION_ERROR
};

/**
 * Maps a provider's thrown error onto a `PaywallError`.
 *
 * `userCancelled` is checked before `code` because it is the one signal
 * RevenueCat guarantees on every purchase rejection, and getting it wrong shows
 * a red alert for a tap the user deliberately took back.
 *
 * The raw error is always preserved as `cause`, so a crash reporter still sees
 * what the SDK actually said.
 */
export function toPaywallError(err: unknown, fallbackMessage: string): PaywallError {
  if (err instanceof PaywallError) return err;

  const snapshot = (typeof err === "object" && err !== null ? err : {}) as ErrorSnapshot;

  if (snapshot.userCancelled === true) {
    return new PaywallError("cancelled", "The purchase was cancelled.", err);
  }

  const code =
    snapshot.code === undefined || snapshot.code === null ? undefined : String(snapshot.code);
  const mapped = code === undefined ? undefined : RC_ERROR_CODES[code];

  return new PaywallError(mapped ?? "unknown", snapshot.message || fallbackMessage, err);
}
