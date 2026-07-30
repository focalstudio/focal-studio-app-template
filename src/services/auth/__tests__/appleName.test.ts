import { appleNameToPersist } from "../appleName";

/**
 * Apple gives up the user's name once and never again. These cases are the
 * difference between an account showing "Ada Lovelace" and one permanently
 * showing an email address.
 */
describe("appleNameToPersist", () => {
  it("joins both parts on the first authorization", () => {
    expect(appleNameToPersist({ givenName: "Ada", familyName: "Lovelace" })).toBe(
      "Ada Lovelace"
    );
  });

  it.each([
    ["given name only", { givenName: "Ada", familyName: null }, "Ada"],
    ["family name only", { givenName: null, familyName: "Lovelace" }, "Lovelace"],
    ["undefined parts", { givenName: "Ada", familyName: undefined }, "Ada"],
  ])("handles a partial name (%s)", (_label, fullName, expected) => {
    expect(appleNameToPersist(fullName)).toBe(expected);
  });

  // This is what every sign-in after the first looks like. Returning a name
  // here would write an empty string over a good one.
  it.each([
    ["null credential", null],
    ["both parts null", { givenName: null, familyName: null }],
    ["empty strings", { givenName: "", familyName: "" }],
    ["whitespace only", { givenName: "   ", familyName: "\t" }],
  ])("returns null when Apple sends nothing usable (%s)", (_label, fullName) => {
    expect(appleNameToPersist(fullName)).toBeNull();
  });

  it("trims stray whitespace rather than storing it", () => {
    expect(appleNameToPersist({ givenName: "  Ada  ", familyName: " Lovelace " })).toBe(
      "Ada Lovelace"
    );
  });

  // A name already on the account is the user's own and may have been edited
  // since. Apple is only ever the source for the very first sign-in.
  it("does not overwrite a name the account already has", () => {
    expect(
      appleNameToPersist({ givenName: "Ada", familyName: "Lovelace" }, "Ada L.")
    ).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "   "],
  ])("treats an existing name of %s as absent", (_label, existing) => {
    expect(
      appleNameToPersist({ givenName: "Ada", familyName: "Lovelace" }, existing)
    ).toBe("Ada Lovelace");
  });
});
