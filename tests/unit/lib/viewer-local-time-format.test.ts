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

  it("adds the local end date when the viewer range crosses midnight", () => {
    // 18:00 - 22:00 in Buenos Aires on May 6 is 23:00 - 03:00 in Madrid.
    expect(
      formatViewerLocalTimeLabel(
        "2026-05-06T21:00:00.000Z",
        "2026-05-07T01:00:00.000Z",
        "Europe/Madrid"
      )
    ).toBe("23:00 - 07 may 03:00 tu hora");
  });

  it("keeps the local end date when the range ends on the same day of a later year", () => {
    // 23:00 on 2026-01-01 to 01:00 on 2027-01-01 in Madrid share day and month.
    expect(
      formatViewerLocalTimeLabel(
        "2026-01-01T22:00:00.000Z",
        "2027-01-01T00:00:00.000Z",
        "Europe/Madrid"
      )
    ).toBe("23:00 - 01 ene 01:00 tu hora");
  });

  it("shows the local range when the offsets only diverge at the end", () => {
    // Santiago leaves daylight saving time on 2026-04-05: both zones are UTC-3
    // at 20:00, but the Buenos Aires 03:00 end is 02:00 in Santiago.
    expect(
      formatViewerLocalTimeLabel(
        "2026-04-04T23:00:00.000Z",
        "2026-04-05T06:00:00.000Z",
        "America/Santiago"
      )
    ).toBe("20:00 - 05 abr 02:00 tu hora");
  });

  it("returns nothing when the offsets match at both ends", () => {
    expect(
      formatViewerLocalTimeLabel(
        "2026-04-04T23:00:00.000Z",
        "2026-04-05T02:00:00.000Z",
        "America/Santiago"
      )
    ).toBeNull();
  });

  it("ignores time zones the runtime does not know", () => {
    expect(formatViewerLocalTimeLabel(STARTS_AT, ENDS_AT, "Not/AZone")).toBeNull();
  });
});
