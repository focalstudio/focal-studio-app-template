import {
  timeOfDaySchema,
  themeSchema,
  storedNotificationPrefsSchema,
  storedSubscriptionSchema,
  userSchema,
} from "../types/schemas";

const DEFAULTS = {
  dailyReminderEnabled: false,
  dailyReminderTime: "09:00",
  reengagementEnabled: false,
  reengagementTime: "18:00",
};

describe("timeOfDaySchema", () => {
  it.each(["00:00", "09:00", "13:45", "23:59"])("accepts %s", (t) => {
    expect(timeOfDaySchema.safeParse(t).success).toBe(true);
  });

  // "9:00" is deliberately rejected: parseTime in services/notifications.ts
  // tolerates it, but the persisted format is documented as zero-padded.
  it.each(["9:00", "24:00", "12:60", "0900", "", "12:00:00"])("rejects %s", (t) => {
    expect(timeOfDaySchema.safeParse(t).success).toBe(false);
  });
});

describe("themeSchema", () => {
  it("accepts the three themes and rejects anything else", () => {
    expect(themeSchema.safeParse("dark").success).toBe(true);
    expect(themeSchema.safeParse("device").success).toBe(true);
    expect(themeSchema.safeParse("blue").success).toBe(false);
  });
});

describe("storedNotificationPrefsSchema", () => {
  const schema = storedNotificationPrefsSchema(DEFAULTS);

  it("fills every field from defaults for an empty object", () => {
    expect(schema.parse({})).toEqual(DEFAULTS);
  });

  it("keeps the good fields when one is malformed", () => {
    const parsed = schema.parse({
      dailyReminderEnabled: true,
      dailyReminderTime: "07:30",
      reengagementEnabled: true,
      reengagementTime: 1800,
    });
    expect(parsed).toEqual({
      dailyReminderEnabled: true,
      dailyReminderTime: "07:30",
      reengagementEnabled: true,
      reengagementTime: "18:00",
    });
  });

  it("rejects a non-object container so the caller's fallback applies", () => {
    expect(schema.safeParse(null).success).toBe(false);
  });
});

describe("storedSubscriptionSchema", () => {
  it("round-trips a known tier", () => {
    expect(storedSubscriptionSchema.parse({ tier: "annual" })).toEqual({ tier: "annual" });
  });

  it.each([["an unknown string", "pro"], ["null", null], ["a number", 1], ["missing", undefined]])(
    "catches an invalid tier (%s) as free",
    (_desc, tier) => {
      expect(storedSubscriptionSchema.parse({ tier })).toEqual({ tier: "free" });
    }
  );
});

describe("userSchema", () => {
  it("requires id and email as strings", () => {
    expect(userSchema.safeParse({ id: "u1", email: "a@b" }).success).toBe(true);
    expect(userSchema.safeParse({ id: 1, email: "a@b" }).success).toBe(false);
    expect(userSchema.safeParse({ id: "u1" }).success).toBe(false);
  });

  // A bad optional display name must not cost the user their session.
  it("drops a malformed name rather than rejecting the user", () => {
    expect(userSchema.parse({ id: "u1", email: "a@b", name: 42 })).toEqual({
      id: "u1",
      email: "a@b",
      name: undefined,
    });
  });
});
