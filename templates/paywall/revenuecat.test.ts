/**
 * **This file is authored for its destination, not its home.**
 *
 * It ships at `templates/paywall/revenuecat.test.ts` and is copied by
 * `scripts/add-paywall.sh` to `src/services/paywall/__tests__/revenuecat.test.ts`,
 * next to the adapter it exercises — which is why `../revenuecat` and `../types`
 * resolve there and not here. `jest.config.js` lists `/templates/` in
 * `testPathIgnorePatterns` so the un-wired template never tries to run this
 * against an SDK it deliberately does not install.
 *
 * **The SDK is mocked here rather than the port.** Everywhere else in this suite
 * providers are faked at the `PaywallProvider` port; an adapter test is the one
 * place that cannot do that, because the mapping *is* the thing under test. Both
 * levels, and when each applies, are in `docs/testing.md`.
 *
 * This is also the only test that can legitimately import
 * `PURCHASES_ERROR_CODE`, so it carries the conformance check for
 * `src/services/paywall/errors.ts` — that table lives in `src/` to get CI
 * coverage, which means it cannot check its own keys against the real enum.
 */

import Purchases, { PURCHASES_ERROR_CODE } from "react-native-purchases";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { revenuecatPaywallProvider } from "../revenuecat";
import { PaywallError, FREE_SUBSCRIPTION } from "../types";
import { RC_ERROR_CODES } from "../errors";
import { SUBSCRIPTION_KEY } from "../cache";

/**
 * A non-virtual mock of the same specifier `jest.setup.js` mocks virtually. Both
 * resolve to the same module ID, so this factory simply replaces the inert one
 * from the setup file — no ordering hazard, and no `virtual: true` needed here.
 */
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(),
  },
  PURCHASES_ERROR_CODE: jest.requireActual("react-native-purchases").PURCHASES_ERROR_CODE,
}));

const sdk = jest.mocked(Purchases);

/**
 * Captured once, at module scope: `configure()` runs when `../revenuecat` is
 * imported, and the `jest.clearAllMocks()` in `beforeEach` below wipes
 * `mock.calls` before any test body sees it.
 */
const configureCalls = [...sdk.configure.mock.calls];

/** A `CustomerInfo` carrying one active entitlement. */
function customerInfo(entitlement: Record<string, unknown> | null = null) {
  return {
    entitlements: { active: entitlement ? { pro: entitlement } : {} },
  } as never;
}

function entitlement(overrides: Record<string, unknown> = {}) {
  return {
    identifier: "pro",
    isActive: true,
    willRenew: true,
    periodType: "NORMAL",
    productIdentifier: "com.example.app.pro.annual",
    expirationDate: "2027-01-01T00:00:00Z",
    latestPurchaseDate: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function offering(packages: Record<string, unknown>[] = [annualPackage()]) {
  return { current: { identifier: "default", availablePackages: packages } } as never;
}

function annualPackage(overrides: Record<string, unknown> = {}) {
  return {
    identifier: "$rc_annual",
    packageType: "ANNUAL",
    product: {
      identifier: "com.example.app.pro.annual",
      priceString: "29,99 €",
      price: 29.99,
      currencyCode: "EUR",
      introPrice: null,
    },
    ...overrides,
  };
}

/** RevenueCat surfaces errors as an Error carrying `code` and `userCancelled`. */
function sdkError(fields: Record<string, unknown>) {
  return Object.assign(new Error("sdk failure"), fields);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("configuration", () => {
  it("configures exactly once, at module scope", () => {
    // The import at the top of this file is what ran it. A component-level
    // `useEffect` would re-run on every mount and every Fast Refresh.
    expect(configureCalls).toHaveLength(1);
    expect(configureCalls[0][0]).toMatchObject({ apiKey: expect.stringMatching(/^appl_|^goog_/) });
  });
});

describe("getSubscription", () => {
  it("maps an active entitlement onto the port's shape", async () => {
    sdk.getCustomerInfo.mockResolvedValue(customerInfo(entitlement()));

    await expect(revenuecatPaywallProvider.getSubscription()).resolves.toEqual({
      tier: "annual",
      expiresAt: Date.parse("2027-01-01T00:00:00Z") / 1000,
      willRenew: true,
      isTrial: false,
      productId: "com.example.app.pro.annual",
    });
  });

  it("maps no active entitlement to free", async () => {
    sdk.getCustomerInfo.mockResolvedValue(customerInfo(null));
    await expect(revenuecatPaywallProvider.getSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });

  /*
   * Rule 1 of the port, and the inverse of AuthProvider.getSession(): the
   * failure mode here is revoking access someone paid for.
   */
  it("falls back to the cached entitlement rather than downgrading", async () => {
    sdk.getCustomerInfo.mockResolvedValue(customerInfo(entitlement()));
    await revenuecatPaywallProvider.getSubscription();

    sdk.getCustomerInfo.mockRejectedValue(sdkError({ code: "10" }));

    await expect(revenuecatPaywallProvider.getSubscription()).resolves.toMatchObject({
      tier: "annual",
    });
  });

  // Rule 2: never throw. A paywall read must not be able to trap app boot.
  it("never throws, even with nothing cached", async () => {
    sdk.getCustomerInfo.mockRejectedValue(sdkError({ code: "10" }));
    await expect(revenuecatPaywallProvider.getSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });

  it("writes through to the local mirror on a successful read", async () => {
    sdk.getCustomerInfo.mockResolvedValue(customerInfo(entitlement()));
    await revenuecatPaywallProvider.getSubscription();

    expect(JSON.parse((await AsyncStorage.getItem(SUBSCRIPTION_KEY))!)).toMatchObject({
      tier: "annual",
    });
  });
});

describe("getOfferings", () => {
  it("maps the current offering onto the port's display shape", async () => {
    sdk.getOfferings.mockResolvedValue(offering());

    await expect(revenuecatPaywallProvider.getOfferings()).resolves.toEqual({
      id: "default",
      packages: [
        {
          id: "$rc_annual",
          tier: "annual",
          priceString: "29,99 €",
          price: 29.99,
          currencyCode: "EUR",
          introOffer: null,
        },
      ],
    });
  });

  it.each([
    ["no current offering", { current: null }],
    ["an offering with no packages", { current: { identifier: "default", availablePackages: [] } }],
  ])("resolves null for %s rather than throwing", async (_desc, offerings) => {
    sdk.getOfferings.mockResolvedValue(offerings as never);
    await expect(revenuecatPaywallProvider.getOfferings()).resolves.toBeNull();
  });

  // Unlike getSubscription, this is a foreground fetch behind a visible loading
  // state, so the screen can retry — it is allowed to throw.
  it("throws a mapped PaywallError when the fetch fails", async () => {
    sdk.getOfferings.mockRejectedValue(sdkError({ code: "10" }));
    await expect(revenuecatPaywallProvider.getOfferings()).rejects.toMatchObject({
      code: "network",
    });
  });
});

describe("purchase", () => {
  it("buys the package matching the tier and returns what the store granted", async () => {
    sdk.getOfferings.mockResolvedValue(offering());
    sdk.purchasePackage.mockResolvedValue({
      customerInfo: customerInfo(entitlement()),
    } as never);

    await expect(revenuecatPaywallProvider.purchase("annual")).resolves.toMatchObject({
      tier: "annual",
    });
    expect(sdk.purchasePackage).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "$rc_annual" })
    );
  });

  /*
   * The store wins over the button. A user can be upgraded mid-flow, and the
   * entitlement that comes back is the truth.
   */
  it("returns the granted tier even when it differs from the requested one", async () => {
    sdk.getOfferings.mockResolvedValue(offering());
    sdk.purchasePackage.mockResolvedValue({
      customerInfo: customerInfo(entitlement({ expirationDate: null })),
    } as never);

    await expect(revenuecatPaywallProvider.purchase("annual")).resolves.toMatchObject({
      tier: "lifetime",
    });
  });

  it("throws not_configured when there is no current offering", async () => {
    sdk.getOfferings.mockResolvedValue({ current: null } as never);
    await expect(revenuecatPaywallProvider.purchase("annual")).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(sdk.purchasePackage).not.toHaveBeenCalled();
  });

  it("throws not_configured naming the tier when no package matches", async () => {
    sdk.getOfferings.mockResolvedValue(offering());
    await expect(revenuecatPaywallProvider.purchase("lifetime")).rejects.toThrow(/lifetime/);
    expect(sdk.purchasePackage).not.toHaveBeenCalled();
  });

  it("maps a user cancellation to cancelled", async () => {
    sdk.getOfferings.mockResolvedValue(offering());
    sdk.purchasePackage.mockRejectedValue(sdkError({ userCancelled: true, code: "1" }));

    await expect(revenuecatPaywallProvider.purchase("annual")).rejects.toMatchObject({
      code: "cancelled",
    });
  });

  it("maps a deferred payment to payment_pending and grants nothing", async () => {
    sdk.getOfferings.mockResolvedValue(offering());
    sdk.purchasePackage.mockRejectedValue(
      sdkError({ code: PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR })
    );

    await expect(revenuecatPaywallProvider.purchase("annual")).rejects.toMatchObject({
      code: "payment_pending",
    });
    expect(await AsyncStorage.getItem(SUBSCRIPTION_KEY)).toBeNull();
  });

  it("maps an already-owned product to already_owned", async () => {
    sdk.getOfferings.mockResolvedValue(offering());
    sdk.purchasePackage.mockRejectedValue(
      sdkError({ code: PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR })
    );

    await expect(revenuecatPaywallProvider.purchase("annual")).rejects.toMatchObject({
      code: "already_owned",
    });
  });
});

describe("restore", () => {
  it("resolves the recovered entitlement", async () => {
    sdk.restorePurchases.mockResolvedValue(customerInfo(entitlement()));
    await expect(revenuecatPaywallProvider.restore()).resolves.toMatchObject({ tier: "annual" });
  });

  /*
   * Nothing to restore is a SUCCESS, not an error — the common case is a user
   * checking. Throwing would paint a red alert over a correct answer.
   */
  it("resolves free rather than throwing when there is nothing to restore", async () => {
    sdk.restorePurchases.mockResolvedValue(customerInfo(null));
    await expect(revenuecatPaywallProvider.restore()).resolves.toEqual(FREE_SUBSCRIPTION);
  });

  // Unlike getSubscription: this one is behind a spinner the user asked for, and
  // silently reporting free would tell a paying user they own nothing.
  it("throws when the store is unreachable", async () => {
    sdk.restorePurchases.mockRejectedValue(
      sdkError({ code: PURCHASES_ERROR_CODE.NETWORK_ERROR })
    );
    await expect(revenuecatPaywallProvider.restore()).rejects.toMatchObject({ code: "network" });
  });
});

describe("subscribe", () => {
  it("registers a listener and returns its own removal", () => {
    const unsubscribe = revenuecatPaywallProvider.subscribe(() => {});

    expect(sdk.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(sdk.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(
      sdk.addCustomerInfoUpdateListener.mock.calls[0][0]
    );
  });

  /*
   * The deferred-purchase path. `payment_pending` has no other resolution route:
   * without this the user is charged and never unlocked.
   */
  it("delivers a late approval to the callback", async () => {
    const onChange = jest.fn();
    revenuecatPaywallProvider.subscribe(onChange);

    const listener = sdk.addCustomerInfoUpdateListener.mock.calls[0][0];
    listener(customerInfo(entitlement()));
    await new Promise(process.nextTick);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tier: "annual" }));
  });
});

describe("identity", () => {
  it("identify binds the app user and applies the returned entitlement", async () => {
    sdk.logIn.mockResolvedValue({ customerInfo: customerInfo(entitlement()) } as never);

    await revenuecatPaywallProvider.identify!("user-1");

    expect(sdk.logIn).toHaveBeenCalledWith("user-1");
    expect(JSON.parse((await AsyncStorage.getItem(SUBSCRIPTION_KEY))!)).toMatchObject({
      tier: "annual",
    });
  });

  it("forget returns to anonymous mode", async () => {
    sdk.logOut.mockResolvedValue(customerInfo(null));
    await expect(revenuecatPaywallProvider.forget!()).resolves.toBeUndefined();
    expect(sdk.logOut).toHaveBeenCalled();
  });

  /*
   * Logging out an already-anonymous user is the SDK's error 22, but the
   * postcondition `forget()` exists to establish is already true — so it is not
   * a failure, and surfacing it would break sign-out for anyone who never
   * signed in.
   */
  it("forget swallows LOG_OUT_ANONYMOUS_USER_ERROR", async () => {
    sdk.logOut.mockRejectedValue(
      sdkError({ code: PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR })
    );
    await expect(revenuecatPaywallProvider.forget!()).resolves.toBeUndefined();
  });

  it("forget still throws a real failure", async () => {
    sdk.logOut.mockRejectedValue(sdkError({ code: PURCHASES_ERROR_CODE.NETWORK_ERROR }));
    await expect(revenuecatPaywallProvider.forget!()).rejects.toMatchObject({ code: "network" });
  });
});

describe("error-code table conformance", () => {
  /*
   * `src/services/paywall/errors.ts` keys its table on the enum's *values*, but
   * lives in `src/` (for CI coverage) where the SDK is not importable. This is
   * the only place that can prove the two agree — without it the table would
   * drift silently the first time RevenueCat renumbered anything.
   */
  it("every mapped key is a real PURCHASES_ERROR_CODE value", () => {
    const real = new Set(Object.values(PURCHASES_ERROR_CODE).map(String));
    for (const key of Object.keys(RC_ERROR_CODES)) {
      expect(real).toContain(key);
    }
  });

  it.each([
    ["PURCHASE_CANCELLED_ERROR", "cancelled"],
    ["PRODUCT_ALREADY_PURCHASED_ERROR", "already_owned"],
    ["PAYMENT_PENDING_ERROR", "payment_pending"],
    ["NETWORK_ERROR", "network"],
    ["STORE_PROBLEM_ERROR", "store_problem"],
    ["CONFIGURATION_ERROR", "not_configured"],
    ["INVALID_CREDENTIALS_ERROR", "not_configured"],
  ])("%s maps to %s", (name, expected) => {
    const value = String(PURCHASES_ERROR_CODE[name as keyof typeof PURCHASES_ERROR_CODE]);
    expect(RC_ERROR_CODES[value]).toBe(expected);
  });
});

describe("port conformance", () => {
  it("identifies itself", () => {
    expect(revenuecatPaywallProvider.name).toBe("revenuecat");
  });

  // Unlike the local scaffold, this adapter DOES implement identity — an app
  // with auth needs it, or a shared device leaks Pro between users.
  it.each(["identify", "forget"] as const)("implements %s", (method) => {
    expect(typeof revenuecatPaywallProvider[method]).toBe("function");
  });

  // Providers may be composed by object spread, which would not carry a bound
  // receiver.
  it("has methods that do not depend on `this`", async () => {
    sdk.getCustomerInfo.mockResolvedValue(customerInfo(null));
    const { getSubscription } = revenuecatPaywallProvider;
    await expect(getSubscription()).resolves.toEqual(FREE_SUBSCRIPTION);
  });

  it("throws PaywallError, never a raw SDK error", async () => {
    sdk.getOfferings.mockRejectedValue(sdkError({ code: "999" }));
    await expect(revenuecatPaywallProvider.getOfferings()).rejects.toBeInstanceOf(PaywallError);
  });
});
