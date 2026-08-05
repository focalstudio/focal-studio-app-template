import { localPaywallProvider } from "./local";
import type { PaywallProvider } from "./types";

export { PaywallError, isEntitled, isValidSubscription, FREE_SUBSCRIPTION } from "./types";
export { paywallErrorMessage } from "./messages";
export type {
  PaywallProvider,
  PaywallSubscription,
  PaywallOffering,
  PaywallPackage,
  PaywallErrorCode,
} from "./types";

/**
 * The active paywall provider.
 *
 * `scripts/add-paywall.sh` rewrites this one assignment — nothing else in the
 * app imports a provider directly, so swapping RevenueCat for another store
 * layer (or back) is a single-line change plus one adapter file.
 */
export const paywallProvider: PaywallProvider = localPaywallProvider;
