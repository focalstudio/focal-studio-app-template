import { RC_ERROR_CODES, toPaywallError } from "../errors";
import { PaywallError } from "../types";
import type { PaywallErrorCode } from "../types";

describe("toPaywallError", () => {
  /*
   * userCancelled is checked before code because it is the one signal RevenueCat
   * guarantees on every purchase rejection. Getting it wrong shows a red alert
   * for a tap the user deliberately took back.
   */
  it("reads userCancelled ahead of any code", () => {
    const err = toPaywallError({ userCancelled: true, code: "10", message: "network" }, "fallback");
    expect(err.code).toBe("cancelled");
  });

  it("ignores userCancelled when false", () => {
    expect(toPaywallError({ userCancelled: false, code: "10" }, "fallback").code).toBe("network");
  });

  it.each([
    ["1", "cancelled"],
    ["2", "store_problem"],
    ["3", "ineligible"],
    ["5", "ineligible"],
    ["6", "already_owned"],
    ["7", "already_owned"],
    ["10", "network"],
    ["11", "not_configured"],
    ["17", "not_configured"],
    ["18", "ineligible"],
    ["20", "payment_pending"],
    ["23", "not_configured"],
    ["32", "network"],
    ["35", "network"],
  ] as [string, PaywallErrorCode][])("maps RevenueCat code %s to %s", (code, expected) => {
    expect(toPaywallError({ code }, "fallback").code).toBe(expected);
  });

  it("accepts a numeric code as well as a string one", () => {
    expect(toPaywallError({ code: 20 }, "fallback").code).toBe("payment_pending");
  });

  it.each([
    ["an unmapped code", { code: "21" }],
    ["no code at all", { message: "something" }],
    ["a null code", { code: null }],
    ["a non-object", "just a string"],
    ["null", null],
  ])("falls back to unknown for %s", (_desc, raw) => {
    expect(toPaywallError(raw, "fallback").code).toBe("unknown");
  });

  it("prefers the provider's message and keeps the raw error as cause", () => {
    const raw = { code: "10", message: "The network connection was lost." };
    const err = toPaywallError(raw, "fallback");
    expect(err.message).toBe("The network connection was lost.");
    expect(err.cause).toBe(raw);
    expect(err).toBeInstanceOf(PaywallError);
  });

  it.each([
    ["an empty message", { code: "10", message: "" }],
    ["a null message", { code: "10", message: null }],
    ["no message", { code: "10" }],
  ])("uses the caller's fallback message for %s", (_desc, raw) => {
    expect(toPaywallError(raw, "Could not reach the store.").message).toBe(
      "Could not reach the store."
    );
  });

  // An adapter that already threw a PaywallError (e.g. not_configured, raised
  // before the SDK was ever called) must survive a surrounding catch untouched.
  it("passes an existing PaywallError through unchanged", () => {
    const original = new PaywallError("not_configured", "No current offering.");
    expect(toPaywallError(original, "fallback")).toBe(original);
  });
});

describe("RC_ERROR_CODES", () => {
  /*
   * This table cannot import PURCHASES_ERROR_CODE — it lives in src/ precisely so
   * tsc, eslint and jest can see it, and the SDK is not a dependency of the
   * template. templates/paywall/revenuecat.test.ts asserts these keys against the
   * real enum; what is checked here is that the table is internally well-formed.
   */
  it("keys are numeric strings, matching the SDK enum's value shape", () => {
    for (const key of Object.keys(RC_ERROR_CODES)) {
      expect(key).toMatch(/^\d+$/);
    }
  });

  it("covers every code a paywall UI must branch on", () => {
    const mapped = new Set(Object.values(RC_ERROR_CODES));
    for (const required of [
      "cancelled",
      "already_owned",
      "ineligible",
      "payment_pending",
      "network",
      "store_problem",
      "not_configured",
    ] as PaywallErrorCode[]) {
      expect(mapped).toContain(required);
    }
  });

  // not_wired is the local scaffold's code — no store can ever produce it.
  it("never maps a provider code to not_wired", () => {
    expect(Object.values(RC_ERROR_CODES)).not.toContain("not_wired");
  });
});
