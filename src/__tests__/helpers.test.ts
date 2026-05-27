import { pickRandom } from "../utils/helpers";

describe("pickRandom", () => {
  it("returns an element from the array", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = pickRandom(arr);
    expect(arr).toContain(result);
  });
  it("returns the only element when array has one item", () => {
    expect(pickRandom(["only"])).toBe("only");
  });
});
