import { paywallErrorMessage } from "../messages";
import { PaywallError } from "../types";
import type { PaywallErrorCode } from "../types";

const ALL_CODES: PaywallErrorCode[] = [
  "not_wired",
  "cancelled",
  "already_owned",
  "ineligible",
  "payment_pending",
  "network",
  "store_problem",
  "not_configured",
  "unknown",
];

describe("paywallErrorMessage", () => {
  it("returns the not_wired message verbatim — it is the actionable one", () => {
    const err = new PaywallError("not_wired", "Purchasing requires a paywall provider. Run …");
    expect(paywallErrorMessage(err)).toBe(err.message);
  });

  it.each(ALL_CODES)("returns a non-empty string for %s", (code) => {
    expect(paywallErrorMessage(new PaywallError(code, "raw"))).toBeTruthy();
  });

  /*
   * Never render a provider's raw error: StoreKit and Play Billing both surface
   * internal transaction and receipt text that leaks implementation detail.
   */
  it.each(ALL_CODES.filter((c) => c !== "not_wired"))(
    "does not leak the raw provider message for %s",
    (code) => {
      const raw = "SKErrorDomain error 2: receipt 0xdeadbeef rejected";
      expect(paywallErrorMessage(new PaywallError(code, raw))).not.toContain(raw);
    }
  );

  /*
   * payment_pending is success-adjacent, not a failure. The copy must not
   * apologise, must not offer a retry, and must not imply anything went wrong —
   * the user has been charged and simply needs approval.
   */
  it("does not phrase payment_pending as a failure", () => {
    const message = paywallErrorMessage(new PaywallError("payment_pending", "raw"));
    expect(message).toMatch(/approv/i);
    expect(message).not.toMatch(/wrong|failed|error|try again/i);
  });

  // Retrying a missing offering never works, so the copy must not suggest it.
  it("does not tell the user to try again for not_configured", () => {
    expect(paywallErrorMessage(new PaywallError("not_configured", "raw"))).not.toMatch(
      /try again\b(?!.*later)/i
    );
  });

  it("points already_owned at Restore rather than at a retry", () => {
    expect(paywallErrorMessage(new PaywallError("already_owned", "raw"))).toMatch(/restore/i);
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["a string", "boom"],
    ["null", null],
    ["undefined", undefined],
  ])("falls back to generic copy for %s", (_desc, value) => {
    expect(paywallErrorMessage(value)).toBe("Something went wrong. Please try again.");
  });
});
