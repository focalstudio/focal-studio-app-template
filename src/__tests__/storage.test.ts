import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
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

describe("loadJson with a schema", () => {
  const schema = z.object({ id: z.string(), count: z.number() });
  const fallback = { id: "default", count: 0 };

  it("returns the parsed value when the blob matches", async () => {
    await saveJson("ok", { id: "abc", count: 3 });
    expect(await loadJson("ok", fallback, schema)).toEqual({ id: "abc", count: 3 });
  });

  it("returns fallback when the shape doesn't match", async () => {
    await saveJson("wrong", { id: "abc", count: "three" });
    expect(await loadJson("wrong", fallback, schema)).toEqual(fallback);
  });

  it("returns fallback for a non-object container", async () => {
    await AsyncStorage.setItem("nullish", "null");
    expect(await loadJson("nullish", fallback, schema)).toEqual(fallback);
  });

  it("returns fallback for a missing key without consulting the schema", async () => {
    expect(await loadJson("absent", fallback, schema)).toEqual(fallback);
  });

  it("strips keys the schema doesn't declare", async () => {
    await saveJson("extra", { id: "abc", count: 3, stale: "from an older version" });
    expect(await loadJson("extra", fallback, schema)).toEqual({ id: "abc", count: 3 });
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
