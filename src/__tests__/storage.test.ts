import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadJson, saveJson, loadNumber, saveNumber, loadString, saveString } from "../utils/storage";

beforeEach(() => AsyncStorage.clear());

describe("loadJson / saveJson", () => {
  it("round-trips an object", async () => {
    const obj = { x: 1, y: "hello" };
    await saveJson("test_key", obj);
    expect(await loadJson("test_key", null)).toEqual(obj);
  });
  it("returns fallback when key is missing", async () => {
    expect(await loadJson("missing", 42)).toBe(42);
  });
  it("returns fallback on corrupt JSON", async () => {
    await AsyncStorage.setItem("bad", "not-json{{{");
    expect(await loadJson("bad", "fallback")).toBe("fallback");
  });
});

describe("loadNumber / saveNumber", () => {
  it("round-trips a number", async () => {
    await saveNumber("n", 99);
    expect(await loadNumber("n", 0)).toBe(99);
  });
  it("returns fallback when key is missing", async () => {
    expect(await loadNumber("missing", 7)).toBe(7);
  });
  it("returns fallback for non-numeric values", async () => {
    await AsyncStorage.setItem("nan", "abc");
    expect(await loadNumber("nan", 5)).toBe(5);
  });
});

describe("loadString / saveString", () => {
  it("round-trips a string", async () => {
    await saveString("s", "hello world");
    expect(await loadString("s", "")).toBe("hello world");
  });
  it("returns fallback when key is missing", async () => {
    expect(await loadString("missing", "default")).toBe("default");
  });
});
