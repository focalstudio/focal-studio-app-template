import { describe, it, expect, beforeEach } from "vitest";
import { loadJson, saveJson, loadNumber, saveNumber, loadStringArray, saveStringArray } from "../storage";

// localStorage is available in the jsdom environment Vitest provides by default.
beforeEach(() => localStorage.clear());

describe("loadJson / saveJson", () => {
  it("round-trips an object", () => {
    const obj = { x: 1, y: "hello" };
    saveJson("test_key", obj);
    expect(loadJson("test_key", null)).toEqual(obj);
  });
  it("returns fallback when key is missing", () => {
    expect(loadJson("missing", 42)).toBe(42);
  });
  it("returns fallback on corrupt JSON", () => {
    localStorage.setItem("bad", "not-json{{{");
    expect(loadJson("bad", "fallback")).toBe("fallback");
  });
});

describe("loadNumber / saveNumber", () => {
  it("round-trips a number", () => {
    saveNumber("n", 99);
    expect(loadNumber("n")).toBe(99);
  });
  it("returns fallback when key is missing", () => {
    expect(loadNumber("missing", 7)).toBe(7);
  });
  it("returns fallback for non-numeric values", () => {
    localStorage.setItem("nan", "abc");
    expect(loadNumber("nan", 5)).toBe(5);
  });
});

describe("loadStringArray / saveStringArray", () => {
  it("round-trips a string array", () => {
    saveStringArray("arr", ["a", "b", "c"]);
    expect(loadStringArray("arr")).toEqual(["a", "b", "c"]);
  });
  it("returns empty array when key is missing", () => {
    expect(loadStringArray("missing")).toEqual([]);
  });
});
