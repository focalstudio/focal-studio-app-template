import * as StoreReview from "expo-store-review";
import { STORAGE_PREFIX, APP_VERSION } from "../constants";
import { loadString, saveString } from "../utils/storage";

const RATING_KEY = `${STORAGE_PREFIX}rating_shown_${APP_VERSION}`;

export async function maybeRequestRating(
  successfulActions: number,
  streak: number
): Promise<void> {
  if (successfulActions < 3 || streak < 3) return;

  const alreadyShown = await loadString(RATING_KEY, "no");
  if (alreadyShown === "yes") return;

  const isAvailable = await StoreReview.isAvailableAsync();
  if (!isAvailable) return;

  await StoreReview.requestReview();
  await saveString(RATING_KEY, "yes");
}

export async function forceRatingPrompt(): Promise<void> {
  await saveString(RATING_KEY, "no");
  const isAvailable = await StoreReview.isAvailableAsync();
  if (isAvailable) await StoreReview.requestReview();
}
