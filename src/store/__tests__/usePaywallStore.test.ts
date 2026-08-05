import { usePaywallStore } from "../usePaywallStore";
import { paywallProvider, PaywallError, FREE_SUBSCRIPTION } from "../../services/paywall";
import { Analytics } from "../../services/analytics";
import { useAuthStore } from "../useAuthStore";
import type { PaywallSubscription, PaywallOffering } from "../../services/paywall";

/**
 * Faked at the PORT, never at an SDK — `docs/testing.md`, "Two levels of
 * mocking". The store's job is to translate port answers into UI state, so the
 * port is exactly the seam to control.
 *
 * These used to reach the real scaffold through storage. That only held while
 * the template had no provider: once `scripts/add-paywall.sh` swaps the barrel's
 * export, the store talks to RevenueCat and every storage assertion would have
 * become false. `services/paywall/__tests__/local.test.ts` covers the scaffold.
 */
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
      id: "$rc_annual",
      tier: "annual",
      priceString: "$29.99",
      price: 29.99,
      currencyCode: "USD",
      introOffer: "7 days free",
    },
  ],
};

const initialState = usePaywallStore.getState();

/*
 * `init()` opens a real subscription on `useAuthStore`, which is a module
 * singleton shared across every test in this file. Start it through this helper
 * so the teardown is tracked: a leaked subscription from an earlier test keeps
 * firing on later ones, and the identity assertions below start counting each
 * other's calls.
 */
const teardowns: (() => void)[] = [];
function startInit(): () => void {
  const stop = usePaywallStore.getState().init();

  // One-shot: a test that tears down explicitly (and one below does, to assert
  // cleanup works) would otherwise have `afterEach` unsubscribe a second time.
  // Zustand tolerates that today, but the teardown also calls a *provider's*
  // unsubscribe, and the port never promised idempotence — so a fake whose
  // unsubscribe counts calls, or a real adapter that throws on a double
  // removal, would fail here for a reason that has nothing to do with the test.
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    stop();
  };

  teardowns.push(once);
  return once;
}

beforeEach(() => {
  jest.clearAllMocks();
  usePaywallStore.setState(initialState, true);
  provider.getSubscription.mockResolvedValue(FREE_SUBSCRIPTION);
  provider.getOfferings.mockResolvedValue(null);
  provider.subscribe.mockReturnValue(jest.fn());
});

afterEach(() => {
  teardowns.splice(0).forEach((stop) => stop());
});

describe("hydrate", () => {
  it("derives isPro and tier from the port's answer", async () => {
    provider.getSubscription.mockResolvedValue(paid);
    await usePaywallStore.getState().hydrate();

    const state = usePaywallStore.getState();
    expect(state.tier).toBe("annual");
    expect(state.isPro).toBe(true);
    expect(state.subscription).toEqual(paid);
    expect(state.isLoading).toBe(false);
  });

  it("leaves isPro false for the free subscription", async () => {
    await usePaywallStore.getState().hydrate();
    const state = usePaywallStore.getState();
    expect(state.isPro).toBe(false);
    expect(state.tier).toBe("free");
    expect(state.isLoading).toBe(false);
  });

  it.each(["monthly", "annual", "lifetime"] as const)("treats %s as entitled", async (tier) => {
    provider.getSubscription.mockResolvedValue({ ...FREE_SUBSCRIPTION, tier });
    await usePaywallStore.getState().hydrate();
    expect(usePaywallStore.getState().isPro).toBe(true);
    expect(usePaywallStore.getState().tier).toBe(tier);
  });

  /*
   * The port contract says getSubscription() never throws. If a custom provider
   * breaks it, hydrate must still clear isLoading — a throw escaping here would
   * leave the user behind a splash screen that never lifts. That is the same
   * class of bug the previous suite's "persisted null container" regression
   * guarded, now expressed at the port.
   */
  it("clears isLoading even if a provider violates the contract and throws", async () => {
    provider.getSubscription.mockRejectedValue(new Error("provider bug"));
    await expect(usePaywallStore.getState().hydrate()).resolves.toBeUndefined();
    expect(usePaywallStore.getState().isLoading).toBe(false);
  });

  // Never downgrade on doubt: a thrown read must not actively clear an
  // entitlement the store already knows about.
  it("does not downgrade an existing entitlement when a provider throws", async () => {
    provider.getSubscription.mockResolvedValue(paid);
    await usePaywallStore.getState().hydrate();

    provider.getSubscription.mockRejectedValue(new Error("provider bug"));
    await usePaywallStore.getState().hydrate();

    expect(usePaywallStore.getState().isPro).toBe(true);
    expect(usePaywallStore.getState().tier).toBe("annual");
  });
});

describe("init", () => {
  it("tears down the provider subscription on cleanup", () => {
    const unsubscribe = jest.fn();
    provider.subscribe.mockReturnValue(unsubscribe);

    startInit()();

    expect(unsubscribe).toHaveBeenCalled();
  });

  /*
   * The out-of-band path. A deferred (Ask-to-Buy) purchase being approved has no
   * other route back into the app — without this the user is charged and never
   * unlocked.
   */
  it("applies an entitlement delivered out of band", () => {
    startInit();
    const onChange = provider.subscribe.mock.calls[0][0];

    onChange(paid);

    expect(usePaywallStore.getState().isPro).toBe(true);
    expect(usePaywallStore.getState().tier).toBe("annual");
  });

  it("applies an expiry delivered out of band", () => {
    usePaywallStore.setState({ ...usePaywallStore.getState(), subscription: paid, tier: "annual", isPro: true });
    startInit();

    provider.subscribe.mock.calls[0][0](FREE_SUBSCRIPTION);

    expect(usePaywallStore.getState().isPro).toBe(false);
    expect(usePaywallStore.getState().tier).toBe("free");
  });
});

describe("init — identity binding", () => {
  const identify = jest.fn().mockResolvedValue(undefined);
  const forget = jest.fn().mockResolvedValue(undefined);
  const signedIn = { id: "user-1", email: "a@b.c" };

  beforeEach(() => {
    identify.mockClear().mockResolvedValue(undefined);
    forget.mockClear().mockResolvedValue(undefined);
    Object.assign(provider, { identify, forget });
    useAuthStore.setState({
      ...useAuthStore.getState(),
      user: null,
      session: null,
      isAuthenticated: false,
    });
  });

  afterEach(() => {
    delete (provider as { identify?: unknown }).identify;
    delete (provider as { forget?: unknown }).forget;
  });

  // hydrate() may resolve before this effect runs, in which case no change event
  // is coming and a subscribe-only implementation would never bind at all.
  it("binds whoever is already signed in when init runs", () => {
    useAuthStore.setState({ ...useAuthStore.getState(), user: signedIn, isAuthenticated: true });

    startInit();

    expect(identify).toHaveBeenCalledWith("user-1");
  });

  it("identifies on sign-in", () => {
    startInit();
    identify.mockClear();

    useAuthStore.setState({ ...useAuthStore.getState(), user: signedIn, isAuthenticated: true });

    expect(identify).toHaveBeenCalledWith("user-1");
  });

  /*
   * The shared-device bug this exists to prevent: without forget(), the next
   * person to sign in on this device inherits the outgoing user's Pro.
   */
  it("forgets on sign-out", () => {
    useAuthStore.setState({ ...useAuthStore.getState(), user: signedIn, isAuthenticated: true });
    startInit();
    forget.mockClear();

    useAuthStore.setState({ ...useAuthStore.getState(), user: null, isAuthenticated: false });

    expect(forget).toHaveBeenCalled();
  });

  it("re-identifies when a different user signs in", () => {
    useAuthStore.setState({ ...useAuthStore.getState(), user: signedIn, isAuthenticated: true });
    startInit();
    identify.mockClear();

    useAuthStore.setState({
      ...useAuthStore.getState(),
      user: { id: "user-2", email: "c@d.e" },
    });

    expect(identify).toHaveBeenCalledWith("user-2");
  });

  // identify() must be safe to call repeatedly, but calling it on every
  // unrelated auth-store write (isSubmitting flipping, say) is pure noise.
  it("does not re-identify when the user id is unchanged", () => {
    useAuthStore.setState({ ...useAuthStore.getState(), user: signedIn, isAuthenticated: true });
    startInit();
    identify.mockClear();

    useAuthStore.setState({ ...useAuthStore.getState(), isSubmitting: true });

    expect(identify).not.toHaveBeenCalled();
  });

  it("stops binding after cleanup", () => {
    const teardown = startInit();
    identify.mockClear();
    teardown();

    useAuthStore.setState({ ...useAuthStore.getState(), user: signedIn, isAuthenticated: true });

    expect(identify).not.toHaveBeenCalled();
  });

  // Failing to bind an identity must never take down app boot.
  it("swallows a rejected identify", async () => {
    identify.mockRejectedValue(new Error("provider offline"));
    useAuthStore.setState({ ...useAuthStore.getState(), user: signedIn, isAuthenticated: true });

    expect(() => startInit()).not.toThrow();
    await Promise.resolve();
  });

  /*
   * A provider that omits these — the local scaffold does — stays in anonymous
   * mode, which is correct for an app with no auth. init() must not assume.
   */
  it("is a no-op for a provider that does not implement identity", () => {
    delete (provider as { identify?: unknown }).identify;
    delete (provider as { forget?: unknown }).forget;

    expect(() => startInit()).not.toThrow();
  });
});

describe("loadOffering", () => {
  it("stores the offering and clears its loading flag", async () => {
    provider.getOfferings.mockResolvedValue(offering);
    await usePaywallStore.getState().loadOffering();

    expect(usePaywallStore.getState().offering).toEqual(offering);
    expect(usePaywallStore.getState().isLoadingOffering).toBe(false);
  });

  // A screen whose job is to sell something should show placeholder copy, not an
  // error, when prices cannot be fetched.
  it("leaves the offering null and clears the flag when the fetch fails", async () => {
    provider.getOfferings.mockRejectedValue(new PaywallError("network", "offline"));
    await expect(usePaywallStore.getState().loadOffering()).resolves.toBeUndefined();

    expect(usePaywallStore.getState().offering).toBeNull();
    expect(usePaywallStore.getState().isLoadingOffering).toBe(false);
  });
});

describe("purchase", () => {
  it("applies the subscription the store granted and resolves true", async () => {
    provider.purchase.mockResolvedValue(paid);
    await expect(usePaywallStore.getState().purchase("annual")).resolves.toBe(true);

    expect(provider.purchase).toHaveBeenCalledWith("annual");
    expect(usePaywallStore.getState().isPro).toBe(true);
    expect(usePaywallStore.getState().isSubmitting).toBe(false);
  });

  /*
   * The store wins over the button. A user can be upgraded, or land on a
   * different plan than the card they tapped — reporting the requested tier
   * would quietly corrupt revenue analytics.
   */
  it("reports the granted tier to analytics, not the requested one", async () => {
    const spy = jest.spyOn(Analytics, "subscriptionStarted").mockImplementation(() => {});
    provider.purchase.mockResolvedValue({ ...paid, tier: "lifetime" });

    await usePaywallStore.getState().purchase("monthly");

    expect(spy).toHaveBeenCalledWith("lifetime");
    spy.mockRestore();
  });

  /*
   * Nobody sees a red error for a tap they took back — but the caller still has
   * to be able to tell a dismissal from a purchase. Resolving `undefined` for
   * both is what let `app/paywall.tsx` close the paywall on a cancelled sheet.
   */
  it("resolves false on a cancellation and grants nothing", async () => {
    provider.purchase.mockRejectedValue(new PaywallError("cancelled", "dismissed"));
    await expect(usePaywallStore.getState().purchase("annual")).resolves.toBe(false);

    expect(usePaywallStore.getState().isPro).toBe(false);
    expect(usePaywallStore.getState().isSubmitting).toBe(false);
  });

  /*
   * payment_pending must NOT be swallowed: the screen needs it to show its own
   * "we'll unlock this when approved" copy. And it must grant nothing — the
   * entitlement arrives later through subscribe().
   */
  it("propagates payment_pending without granting entitlement", async () => {
    provider.purchase.mockRejectedValue(new PaywallError("payment_pending", "awaiting approval"));
    await expect(usePaywallStore.getState().purchase("annual")).rejects.toMatchObject({
      code: "payment_pending",
    });

    expect(usePaywallStore.getState().isPro).toBe(false);
    expect(usePaywallStore.getState().isSubmitting).toBe(false);
  });

  it.each(["already_owned", "network", "store_problem", "not_configured", "unknown"] as const)(
    "propagates %s and resets isSubmitting",
    async (code) => {
      provider.purchase.mockRejectedValue(new PaywallError(code, "nope"));
      await expect(usePaywallStore.getState().purchase("annual")).rejects.toMatchObject({ code });
      expect(usePaywallStore.getState().isSubmitting).toBe(false);
    }
  );

  it("sets isSubmitting while in flight", async () => {
    let resolvePurchase: (s: PaywallSubscription) => void = () => {};
    provider.purchase.mockReturnValue(
      new Promise<PaywallSubscription>((resolve) => {
        resolvePurchase = resolve;
      })
    );

    const pending = usePaywallStore.getState().purchase("annual");
    expect(usePaywallStore.getState().isSubmitting).toBe(true);

    resolvePurchase(paid);
    await pending;
    expect(usePaywallStore.getState().isSubmitting).toBe(false);
  });
});

describe("restore", () => {
  it("resolves true and applies the entitlement when something is found", async () => {
    provider.restore.mockResolvedValue(paid);
    await expect(usePaywallStore.getState().restore()).resolves.toBe(true);
    expect(usePaywallStore.getState().isPro).toBe(true);
  });

  /*
   * Nothing to restore is a SUCCESSFUL answer, not an error — the common case is
   * a user checking. Throwing there would paint a red alert over a correct
   * result.
   */
  it("resolves false rather than throwing when there is nothing to restore", async () => {
    provider.restore.mockResolvedValue(FREE_SUBSCRIPTION);
    await expect(usePaywallStore.getState().restore()).resolves.toBe(false);
    expect(usePaywallStore.getState().isPro).toBe(false);
  });

  it("propagates a real failure and resets isSubmitting", async () => {
    provider.restore.mockRejectedValue(new PaywallError("network", "offline"));
    await expect(usePaywallStore.getState().restore()).rejects.toMatchObject({ code: "network" });
    expect(usePaywallStore.getState().isSubmitting).toBe(false);
  });
});
