import { describe, expect, it } from "vitest";
import { isKnownTimeZone } from "@/lib/date-time/time-zone";

describe("time zone names", () => {
  it.each(["America/Argentina/Buenos_Aires", "Europe/Madrid", "UTC"])("recognizes %s", (zone) => {
    expect(isKnownTimeZone(zone)).toBe(true);
  });

  it.each(["America/Buenos_Aires_Ciudad", "Argentina", "GMT+25", "Buenos Aires"])("rejects %j, which names no zone", (zone) => {
    expect(isKnownTimeZone(zone)).toBe(false);
  });
});
