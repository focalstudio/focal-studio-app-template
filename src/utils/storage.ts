import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ZodType } from "zod";

/**
 * Reads a persisted JSON blob.
 *
 * Pass a zod schema to validate what comes back. Persisted blobs are untrusted
 * input — a downgrade, a partial write, or a schema change between app versions
 * all produce JSON that no longer matches the type it is cast to. With a schema
 * the fallback is returned on a shape mismatch instead of the mismatch reaching
 * the caller as a lie; without one the cast is unchecked, so prefer the schema
 * form for anything beyond a throwaway value. Schemas live in
 * `src/types/schemas.ts`.
 *
 * The `import type` above is deliberate: zod arrives as an argument, so this
 * module pulls none of it into the bundle on its own.
 */
export async function loadJson<T>(key: string, fallback: T): Promise<T>;
export async function loadJson<T, F>(key: string, fallback: F, schema: ZodType<T>): Promise<T | F>;
export async function loadJson(key: string, fallback: unknown, schema?: ZodType): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (schema === undefined) return parsed;
    const result = schema.safeParse(parsed);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

export async function saveJson<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage write failures are non-fatal.
  }
}

export async function loadString(key: string, fallback = ""): Promise<string> {
  try {
    return (await AsyncStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function saveString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
}

export async function loadNumber(key: string, fallback: number): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export async function saveNumber(key: string, value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {}
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}
