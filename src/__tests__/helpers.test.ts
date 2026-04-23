import { describe, it, expect } from "vitest";
import { pad, formatMMSS, pickRandom, keyUTCDate } from "../helpers";

describe("pad", () => {
  it("pads single-digit numbers", () => {
    expect(pad(3)).toBe("03");
    expect(pad(0)).toBe("00");
  });
  it("leaves two-digit numbers unchanged", () => {
    expect(pad(42)).toBe("42");
  });
});

describe("formatMMSS", () => {
  it("formats 90 seconds as 01:30", () => {
    expect(formatMMSS(90)).toBe("01:30");
  });
  it("formats 0 as 00:00", () => {
    expect(formatMMSS(0)).toBe("00:00");
  });
  it("formats 3661 as 61:01", () => {
    expect(formatMMSS(3661)).toBe("61:01");
  });
});

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

describe("keyUTCDate", () => {
  it("returns a YYYY-MM-DD string", () => {
    const result = keyUTCDate(0); // Unix epoch
    expect(result).toBe("1970-01-01");
  });
  it("matches ISO date format", () => {
    const ts = Date.UTC(2026, 3, 23); // April 23 2026
    expect(keyUTCDate(ts)).toBe("2026-04-23");
  });
});
