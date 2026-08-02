/**
 * See `docs/testing.md` / `home-screen.test.tsx` for the harness pattern this
 * copies. Only slide 1 is asserted — the `FlatList` is horizontal-paginated,
 * and later slides require simulating a scroll to become visible.
 */

import { renderRouter, screen } from "expo-router/testing-library";
import { APP_NAME } from "../../constants";
import OnboardingScreen from "../../../app/onboarding";

describe("OnboardingScreen", () => {
  it("renders slide 1 with Skip and Next affordances", async () => {
    renderRouter({ index: OnboardingScreen }, { initialUrl: "/" });

    expect(await screen.findByText(`Welcome to ${APP_NAME}`)).toBeOnTheScreen();
    expect(screen.getByText("Skip")).toBeOnTheScreen();
    expect(screen.getByText("Next")).toBeOnTheScreen();
  });
});
