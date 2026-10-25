import { describe, expect, it } from "vitest";
import { fromBuenosAiresMinuteKey, toBuenosAiresMinuteKey } from "@/src/modules/shared/application/date-time/buenos-aires-minute";

describe("Buenos Aires minute keys", () => {
  it("reads an instant as the Buenos Aires minute a datetime-local input holds", () => {
    expect(toBuenosAiresMinuteKey(new Date("2026-10-16T12:00:59.999Z"))).toBe("2026-10-16T09:00");
    expect(toBuenosAiresMinuteKey(new Date("2026-10-17T02:30:00.000Z"))).toBe("2026-10-16T23:30");
  });

  it("turns a Buenos Aires minute back into the instant it names", () => {
    expect(fromBuenosAiresMinuteKey("2026-10-16T09:00")?.toISOString()).toBe("2026-10-16T12:00:00.000Z");
    expect(fromBuenosAiresMinuteKey("2026-12-31T23:59")?.toISOString()).toBe("2027-01-01T02:59:00.000Z");
  });

  it.each(["", "2026-10-16", "2026-10-16T9:00", "2026-02-30T10:00", "2026-10-16T24:00", "2026-10-16T09:00:00"])(
    "rejects %j, which is not one complete, real minute",
    (key) => {
      expect(fromBuenosAiresMinuteKey(key)).toBeNull();
    }
  );
});
