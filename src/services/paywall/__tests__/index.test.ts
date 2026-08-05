import { paywallProvider } from "../index";

/**
 * Port conformance for whatever provider the barrel currently points at.
 *
 * Deliberately asserts nothing about *which* provider that is. The barrel is a
 * generated file — `scripts/add-paywall.sh` rewrites its single assignment — so
 * a test pinning it to `localPaywallProvider` passes in the template and goes
 * red in every generated app that wires a paywall. That is exactly the failure
 * `services/auth/__tests__/local.test.ts` carries a header about, and it is why
 * the scaffold's own behaviour is asserted in `local.test.ts` (which imports
 * `../local` directly) rather than here.
 *
 * What stays true for every provider is the shape of the port. An adapter
 * repeats these assertions in its own contract test; this is the half that runs
 * whether or not one is installed.
 */
describe("the active paywall provider", () => {
  it("identifies itself for logs and dev tooling", () => {
    expect(typeof paywallProvider.name).toBe("string");
    expect(paywallProvider.name.length).toBeGreaterThan(0);
  });

  it.each(["getSubscription", "getOfferings", "purchase", "restore", "subscribe"] as const)(
    "implements %s",
    (method) => {
      expect(typeof paywallProvider[method]).toBe("function");
    }
  );

  // Optional by contract: a provider that omits them operates in anonymous mode,
  // which is correct for an app with no auth. `usePaywallStore.init()` skips the
  // call rather than assuming, so both shapes have to be legal here.
  it.each(["identify", "forget"] as const)("implements %s or omits it entirely", (method) => {
    const value = paywallProvider[method];
    expect(value === undefined || typeof value === "function").toBe(true);
  });

  it("returns an unsubscribe from subscribe()", () => {
    const unsubscribe = paywallProvider.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});
