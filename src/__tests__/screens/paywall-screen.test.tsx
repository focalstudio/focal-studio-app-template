/**
 * See `docs/testing.md` / `home-screen.test.tsx` for the harness pattern this
 * copies.
 *
 * `handleSubscribe` (`app/paywall.tsx`) deliberately throws — RevenueCat isn't
 * wired yet — so "Start Free Trial" is asserted to render but never pressed.
 */

import { renderRouter, screen } from "expo-router/testing-library";
import PaywallScreen from "../../../app/paywall";

describe("PaywallScreen", () => {
  it("renders the trial pitch and all three plan tiers", async () => {
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    expect(await screen.findByText("Start your 7-day free trial. Cancel anytime.")).toBeOnTheScreen();
    expect(screen.getByText("Monthly")).toBeOnTheScreen();
    expect(screen.getByText("Annual")).toBeOnTheScreen();
    expect(screen.getByText("Lifetime")).toBeOnTheScreen();
    expect(screen.getAllByText("Start Free Trial")).toHaveLength(3);
    expect(screen.getByText("Restore purchases")).toBeOnTheScreen();
  });
});
