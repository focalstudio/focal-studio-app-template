import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { forceRatingPrompt, maybeRequestRating } from "../ratingService";
import { APP_VERSION, STORAGE_PREFIX } from "../../constants";

/**
 * `expo-store-review` is mocked in `jest.setup.js` with `isAvailableAsync`
 * resolving false, so no suite accidentally trips the real prompt path. This
 * one drives it deliberately and sets the value it needs per test.
 */
const mockStoreReview = jest.mocked(StoreReview);

// Version-scoped on purpose: a bumped APP_VERSION gives every user a fresh
// chance to be asked. Deriving the key the same way the module does keeps that
// property asserted rather than assumed.
const RATING_KEY = `${STORAGE_PREFIX}rating_shown_${APP_VERSION}`;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockStoreReview.isAvailableAsync.mockResolvedValue(true);
  mockStoreReview.requestReview.mockResolvedValue(undefined);
});

describe("maybeRequestRating — eligibility gates", () => {
  it.each([
    ["too few actions", 2, 5],
    ["too short a streak", 5, 2],
    ["neither threshold met", 0, 0],
    ["actions one below the threshold", 2, 3],
    ["streak one below the threshold", 3, 2],
  ])("does not prompt with %s", async (_label, actions, streak) => {
    await maybeRequestRating(actions, streak);

    expect(mockStoreReview.requestReview).not.toHaveBeenCalled();
    // An ineligible call must not consume the one prompt this version gets.
    expect(await AsyncStorage.getItem(RATING_KEY)).toBeNull();
  });

  it("prompts exactly at the thresholds (3 actions, 3 streak)", async () => {
    await maybeRequestRating(3, 3);

    expect(mockStoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it("does not even ask the SDK whether it is available when ineligible", async () => {
    await maybeRequestRating(1, 1);

    expect(mockStoreReview.isAvailableAsync).not.toHaveBeenCalled();
  });
});

describe("maybeRequestRating — once per version", () => {
  it("records that it prompted", async () => {
    await maybeRequestRating(5, 5);

    expect(await AsyncStorage.getItem(RATING_KEY)).toBe("yes");
  });

  it("does not prompt twice for the same version", async () => {
    await maybeRequestRating(5, 5);
    await maybeRequestRating(5, 5);

    expect(mockStoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it("prompts again once the version key changes", async () => {
    // Simulates the previous version's flag surviving an app update: the key is
    // version-scoped, so the old value must not suppress the new version.
    await AsyncStorage.setItem(`${STORAGE_PREFIX}rating_shown_0.0.0-previous`, "yes");

    await maybeRequestRating(5, 5);

    expect(mockStoreReview.requestReview).toHaveBeenCalledTimes(1);
  });
});

describe("maybeRequestRating — availability", () => {
  it("does not prompt when the platform says review is unavailable", async () => {
    mockStoreReview.isAvailableAsync.mockResolvedValue(false);

    await maybeRequestRating(5, 5);

    expect(mockStoreReview.requestReview).not.toHaveBeenCalled();
  });

  it("does not burn the once-per-version flag when review was unavailable", async () => {
    mockStoreReview.isAvailableAsync.mockResolvedValue(false);

    await maybeRequestRating(5, 5);

    // Writing "yes" here would silently cost the user's only prompt for this
    // version on a call that never showed anything.
    expect(await AsyncStorage.getItem(RATING_KEY)).toBeNull();
  });

  it("does not record a prompt that threw", async () => {
    mockStoreReview.requestReview.mockRejectedValue(new Error("StoreKit unavailable"));

    await expect(maybeRequestRating(5, 5)).rejects.toThrow("StoreKit unavailable");

    // `saveString` runs after `requestReview()` resolves, so a rejection must
    // leave the flag unset and the next eligible call free to retry.
    expect(await AsyncStorage.getItem(RATING_KEY)).toBeNull();
  });
});

describe("forceRatingPrompt", () => {
  it("clears a previously-recorded prompt and asks again", async () => {
    await maybeRequestRating(5, 5);
    expect(await AsyncStorage.getItem(RATING_KEY)).toBe("yes");
    jest.clearAllMocks();
    mockStoreReview.isAvailableAsync.mockResolvedValue(true);

    await forceRatingPrompt();

    expect(await AsyncStorage.getItem(RATING_KEY)).toBe("no");
    expect(mockStoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it("still resets the flag when review is unavailable", async () => {
    mockStoreReview.isAvailableAsync.mockResolvedValue(false);

    await forceRatingPrompt();

    expect(await AsyncStorage.getItem(RATING_KEY)).toBe("no");
    expect(mockStoreReview.requestReview).not.toHaveBeenCalled();
  });

  it("leaves the gate open, so a later eligible call can prompt", async () => {
    await forceRatingPrompt();
    jest.clearAllMocks();
    mockStoreReview.isAvailableAsync.mockResolvedValue(true);

    await maybeRequestRating(5, 5);

    expect(mockStoreReview.requestReview).toHaveBeenCalledTimes(1);
  });
});
