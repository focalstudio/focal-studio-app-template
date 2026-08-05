/**
 * See `docs/testing.md` / `home-screen.test.tsx` for the harness pattern this
 * copies.
 *
 * This file used to carry a header saying "Start Free Trial" could be asserted
 * but never pressed, because `handleSubscribe` deliberately threw. It no longer
 * throws — the screen goes through `usePaywallStore`, which goes through the
 * `PaywallProvider` port — so the buttons are pressed here for the first time.
 *
 * Faked at the PORT, never at an SDK (`docs/testing.md`, "Two levels of
 * mocking"): the screen's contract is with the store, and the store's is with
 * the port.
 */

import { Alert } from "react-native";
import { renderRouter, screen, fireEvent, waitFor, act } from "expo-router/testing-library";
import { router } from "expo-router";

import { usePaywallStore } from "../../store/usePaywallStore";
import { paywallProvider, PaywallError, FREE_SUBSCRIPTION } from "../../services/paywall";
import type { PaywallOffering, PaywallSubscription } from "../../services/paywall";
import PaywallScreen from "../../../app/paywall";

jest.mock("../../services/paywall", () => {
  const actual = jest.requireActual("../../services/paywall");
  return {
    ...actual,
    paywallProvider: {
      name: "fake",
      getSubscription: jest.fn(),
      getOfferings: jest.fn(),
      purchase: jest.fn(),
      restore: jest.fn(),
      subscribe: jest.fn(() => jest.fn()),
    },
  };
});

const provider = jest.mocked(paywallProvider);

const paid: PaywallSubscription = {
  tier: "annual",
  expiresAt: 1_800_000_000,
  willRenew: true,
  isTrial: false,
  productId: "com.example.app.pro.annual",
};

const offering: PaywallOffering = {
  id: "default",
  packages: [
    {
      id: "$rc_monthly",
      tier: "monthly",
      priceString: "4,99 €",
      price: 4.99,
      currencyCode: "EUR",
      introOffer: null,
    },
    {
      id: "$rc_annual",
      tier: "annual",
      priceString: "29,99 €",
      price: 29.99,
      currencyCode: "EUR",
      introOffer: "7 days free",
    },
  ],
};

const initialState = usePaywallStore.getState();

let alertSpy: jest.SpyInstance;
let backSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  usePaywallStore.setState(initialState, true);
  provider.getOfferings.mockResolvedValue(null);
  provider.subscribe.mockReturnValue(jest.fn());
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  backSpy = jest.spyOn(router, "back").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
  backSpy.mockRestore();
});

describe("PaywallScreen — no provider wired", () => {
  it("renders every tier with placeholder prices instead of hardcoded currency", async () => {
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    expect(await screen.findByText("Monthly")).toBeOnTheScreen();
    expect(screen.getByText("Annual")).toBeOnTheScreen();
    expect(screen.getByText("Lifetime")).toBeOnTheScreen();
    // Regex, not an exact string: the price and its period share one composed
    // <Text>, so the node's text is "— / month", not "—".
    expect(screen.getAllByText(/—/)).toHaveLength(3);
    expect(screen.getByText("Restore purchases")).toBeOnTheScreen();
  });

  // The literal "$4.99" this replaced was wrong in every non-USD storefront and
  // wrong the day a price changed in App Store Connect.
  it("renders no hardcoded price anywhere", async () => {
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });
    await screen.findByText("Monthly");

    expect(screen.queryByText(/\$\d/)).toBeNull();
  });

  /*
   * The test the old header said could not exist: pressing the button now
   * surfaces the scaffold's `not_wired` message rather than crashing the screen.
   */
  it("surfaces not_wired on purchase and does not navigate away", async () => {
    // The scaffold's real message, verbatim — the point of the assertion below
    // is that the actionable command survives the trip to the alert.
    provider.purchase.mockRejectedValue(
      new PaywallError(
        "not_wired",
        "Purchasing requires a paywall provider. Run `bash scripts/add-paywall.sh revenuecat`, " +
          "or implement the PaywallProvider port in src/services/paywall/."
      )
    );
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    fireEvent.press((await screen.findAllByText("Continue"))[0]);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][0]).toBe("Purchase Failed");
    expect(alertSpy.mock.calls[0][1]).toMatch(/add-paywall\.sh/);
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("surfaces not_wired on restore and does not navigate away", async () => {
    provider.restore.mockRejectedValue(new PaywallError("not_wired", "Restoring purchases … Run …"));
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    fireEvent.press(await screen.findByText("Restore purchases"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Restore Failed", expect.any(String)));
    expect(backSpy).not.toHaveBeenCalled();
  });
});

describe("PaywallScreen — a provider with an offering", () => {
  beforeEach(() => {
    provider.getOfferings.mockResolvedValue(offering);
  });

  it("renders the store's localized prices and intro copy", async () => {
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    expect(await screen.findByText(/29,99/)).toBeOnTheScreen();
    expect(screen.getByText(/4,99/)).toBeOnTheScreen();
    expect(screen.getByText("7 days free")).toBeOnTheScreen();
    expect(screen.queryByText(/—/)).toBeNull();
  });

  // Only the tiers the store actually sells get a card — a card with no working
  // button would throw `not_configured` on a tier the screen itself offered.
  it("renders only the tiers present in the offering", async () => {
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    await screen.findByText(/29,99/);
    expect(screen.queryByText("Lifetime")).toBeNull();
  });

  it("fetches the offering exactly once", async () => {
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    await screen.findByText(/29,99/);
    expect(provider.getOfferings).toHaveBeenCalledTimes(1);
  });

  it("purchases the pressed tier and dismisses on success", async () => {
    provider.purchase.mockResolvedValue(paid);
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    await screen.findByText(/29,99/);
    fireEvent.press(screen.getAllByText("Continue")[1]);

    await waitFor(() => expect(provider.purchase).toHaveBeenCalledWith("annual"));
    expect(backSpy).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  /*
   * A dismissed sheet raises no alert — and must not close the paywall either.
   *
   * This test previously asserted only the alert, which is why the navigation
   * bug shipped: the store swallowed the cancellation, `purchase()` resolved,
   * and `router.back()` ran regardless. Someone who changed their mind in the
   * StoreKit sheet was returned to the app as though they had bought.
   */
  it("neither alerts nor navigates when the user cancels", async () => {
    provider.purchase.mockRejectedValue(new PaywallError("cancelled", "dismissed"));
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    await screen.findByText(/29,99/);
    fireEvent.press(screen.getAllByText("Continue")[0]);

    await waitFor(() => expect(provider.purchase).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
    expect(backSpy).not.toHaveBeenCalled();
    expect(usePaywallStore.getState().isPro).toBe(false);
  });

  /*
   * Ask-to-Buy. Not a failure: the copy must not apologise, the sheet must
   * dismiss, and nothing may be granted — the entitlement arrives later through
   * the listener in _layout.tsx.
   */
  it("treats a pending payment as approval-needed, dismisses, and grants nothing", async () => {
    provider.purchase.mockRejectedValue(new PaywallError("payment_pending", "awaiting approval"));
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    await screen.findByText(/29,99/);
    fireEvent.press(screen.getAllByText("Continue")[0]);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][0]).toBe("Approval Needed");
    expect(backSpy).toHaveBeenCalled();
    expect(usePaywallStore.getState().isPro).toBe(false);
  });
});

describe("PaywallScreen — restore", () => {
  /*
   * Nothing to restore is a successful answer, not an error. The alert says so,
   * and the screen stays open so the user can still buy.
   */
  it("reports nothing to restore without navigating away", async () => {
    provider.restore.mockResolvedValue(FREE_SUBSCRIPTION);
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    fireEvent.press(await screen.findByText("Restore purchases"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Nothing to Restore", expect.any(String))
    );
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("dismisses when a purchase is recovered", async () => {
    provider.restore.mockResolvedValue(paid);
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    fireEvent.press(await screen.findByText("Restore purchases"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Purchases Restored", expect.any(String))
    );
    expect(backSpy).toHaveBeenCalled();
    expect(usePaywallStore.getState().isPro).toBe(true);
  });

  it("surfaces a real restore failure", async () => {
    provider.restore.mockRejectedValue(new PaywallError("network", "offline"));
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });

    fireEvent.press(await screen.findByText("Restore purchases"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Restore Failed", expect.any(String)));
    expect(backSpy).not.toHaveBeenCalled();
  });
});

describe("PaywallScreen — entitlement delivered out of band", () => {
  // The deferred-purchase path end to end: the listener opened in _layout.tsx
  // is the only route by which an approved Ask-to-Buy purchase reaches the app.
  it("unlocks when the provider reports a late approval", async () => {
    renderRouter({ index: PaywallScreen }, { initialUrl: "/" });
    await screen.findByText("Monthly");

    usePaywallStore.getState().init();
    const onChange = provider.subscribe.mock.calls.at(-1)![0];

    act(() => onChange(paid));

    expect(usePaywallStore.getState().isPro).toBe(true);
  });
});
