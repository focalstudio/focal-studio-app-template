import { Capacitor } from "@capacitor/core";
import { InAppReview } from "@capacitor-community/in-app-review";
import { STORAGE_PREFIX } from "./constants";

const RATING_KEY = `${STORAGE_PREFIX}_rating_prompted`;

// Force-triggers the rating dialog regardless of conditions (dev use only).
export async function forceRatingPrompt(): Promise<void> {
  localStorage.removeItem(RATING_KEY);
  await InAppReview.requestReview();
}

/**
 * Requests an in-app review if conditions are met.
 * Call after a positive user interaction (e.g. completing a core action).
 *
 * Default condition: successfulActions >= 3 AND streak >= 3.
 * Adjust the thresholds to match your app's engagement model.
 */
export async function maybeRequestRating(
  successfulActions: number,
  streak: number,
): Promise<void> {
  if (localStorage.getItem(RATING_KEY)) return;
  if (!Capacitor.isNativePlatform()) return;

  if (successfulActions < 3 || streak < 3) return;

  localStorage.setItem(RATING_KEY, "1");
  await InAppReview.requestReview();
}
