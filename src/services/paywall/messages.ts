import { PaywallError } from "./types";

/**
 * Maps a paywall failure to something safe to show a user.
 *
 * Never render a provider's raw error: StoreKit and Play Billing both surface
 * internal transaction and receipt text that leaks implementation detail and
 * reads as gibberish. Branch on `PaywallError.code` instead.
 *
 * `not_wired` is the exception — it can only fire in a template that hasn't been
 * connected to a paywall provider yet, so it says exactly what to do.
 *
 * Two of these are deliberately not failure copy:
 * - `payment_pending` is a *success-adjacent* state. The wording must not
 *   apologise, must not offer a retry, and must not imply anything went wrong.
 * - `cancelled` is swallowed by the store before any screen sees it. The case
 *   exists so a custom screen rendering the error itself can't say "something
 *   went wrong" for a sheet the user deliberately dismissed.
 */
export function paywallErrorMessage(err: unknown): string {
  if (err instanceof PaywallError) {
    switch (err.code) {
      case "not_wired":
        return err.message;
      case "cancelled":
        return "The purchase was cancelled.";
      case "already_owned":
        return "You already own this. Tap “Restore purchases” to get access back.";
      case "ineligible":
        return "This purchase isn't available on your account.";
      case "payment_pending":
        return "Your payment is being approved. We'll unlock everything as soon as it clears — no need to buy again.";
      case "network":
        return "No connection. Check your network and try again.";
      case "store_problem":
        return "The App Store is having trouble right now. Please try again in a few minutes.";
      // A developer-facing state that a user can still land on if the app ships
      // misconfigured, so it needs copy that isn't a lie. It deliberately does
      // not say "try again" — retrying a missing offering never works.
      case "not_configured":
        return "Purchases aren't available right now. Please try again later.";
      case "unknown":
        return "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}
