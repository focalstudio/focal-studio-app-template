import { paywallProvider } from "../index";
import { localPaywallProvider } from "../local";

/**
 * The barrel is a generated file: `scripts/add-paywall.sh` rewrites its single
 * assignment. These tests pin the two things that rewrite depends on.
 */
describe("the paywall barrel", () => {
  it("defaults to the local scaffold, so a fresh clone carries no store dependency", () => {
    expect(paywallProvider).toBe(localPaywallProvider);
    expect(paywallProvider.name).toBe("local");
  });

  /*
   * Port conformance. An adapter copied in by the script must satisfy the same
   * shape, and its own contract test asserts this list again — this is the
   * template-side half.
   */
  it.each([
    "getSubscription",
    "getOfferings",
    "purchase",
    "restore",
    "subscribe",
  ] as const)("implements %s", (method) => {
    expect(typeof paywallProvider[method]).toBe("function");
  });

  it("leaves the optional identity methods absent by default", () => {
    expect(paywallProvider.identify).toBeUndefined();
    expect(paywallProvider.forget).toBeUndefined();
  });
});
