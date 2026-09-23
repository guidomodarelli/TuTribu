import { describe, expect, it } from "vitest";

import { formatViewerLocalTimeLabel } from "@/lib/date-time/viewer-local-time-format";

const STARTS_AT = "2026-05-06T18:00:00.000Z";
const ENDS_AT = "2026-05-06T19:00:00.000Z";

describe("formatViewerLocalTimeLabel", () => {
  it("returns nothing before the viewer time zone is known", () => {
    expect(formatViewerLocalTimeLabel(STARTS_AT, ENDS_AT, null)).toBeNull();
  });

  it("returns nothing when the viewer shares the Buenos Aires offset", () => {
    expect(
      formatViewerLocalTimeLabel(STARTS_AT, ENDS_AT, "America/Argentina/Buenos_Aires")
    ).toBeNull();
    expect(formatViewerLocalTimeLabel(STARTS_AT, ENDS_AT, "America/Sao_Paulo")).toBeNull();
  });

  it("formats the range in the viewer time zone when the offset differs", () => {
    expect(formatViewerLocalTimeLabel(STARTS_AT, ENDS_AT, "America/Mexico_City")).toBe(
      "12:00 - 13:00 tu hora"
    );
    expect(formatViewerLocalTimeLabel(STARTS_AT, null, "Europe/Madrid")).toBe(
      "20:00 tu hora"
    );
  });

  it("adds the local date when the viewer is already on another day", () => {
    expect(formatViewerLocalTimeLabel(STARTS_AT, ENDS_AT, "Asia/Tokyo")).toBe(
      "07 may 03:00 - 04:00 tu hora"
    );
  });

  it("ignores time zones the runtime does not know", () => {
    expect(formatViewerLocalTimeLabel(STARTS_AT, ENDS_AT, "Not/AZone")).toBeNull();
  });
});
