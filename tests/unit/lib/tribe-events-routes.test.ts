import { describe, expect, it } from "vitest";

import {
  buildTribeEventAttendanceExportUrl,
  buildTribeEventsRoute,
} from "@/lib/events/tribe-events-routes";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OCCURRENCE_STARTS_AT = "2026-05-06T18:00:00.000Z";
const OCCURRENCE_KEY = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f@2026-05-06T18:00:00.000Z";

describe("buildTribeEventsRoute", () => {
  it("returns the bare events route when no query is given", () => {
    expect(buildTribeEventsRoute("matematica-pro")).toBe("/matematica-pro/eventos");
  });

  it("adds the visible month", () => {
    expect(buildTribeEventsRoute("matematica-pro", { month: "2026-05" })).toBe(
      "/matematica-pro/eventos?month=2026-05"
    );
  });

  it("adds an encoded occurrence key that round-trips through URLSearchParams", () => {
    const route = buildTribeEventsRoute("matematica-pro", {
      month: "2026-05",
      occurrenceKey: OCCURRENCE_KEY,
    });
    const url = new URL(route, "https://dev-tutribu.app");

    expect(url.pathname).toBe("/matematica-pro/eventos");
    expect(url.searchParams.get("month")).toBe("2026-05");
    expect(url.searchParams.get("event")).toBe(OCCURRENCE_KEY);
  });
});

describe("buildTribeEventAttendanceExportUrl", () => {
  it("builds the same-origin CSV export URL with the encoded occurrence start", () => {
    const exportUrl = buildTribeEventAttendanceExportUrl({
      eventId: EVENT_ID,
      occurrenceStartsAt: OCCURRENCE_STARTS_AT,
      tribeSlug: "matematica-pro",
    });
    const url = new URL(exportUrl, "https://dev-tutribu.app");

    expect(exportUrl.startsWith("/")).toBe(true);
    expect(url.pathname).toBe(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/attendance/export`
    );
    expect(url.searchParams.get("occurrence")).toBe(OCCURRENCE_STARTS_AT);
  });
});
