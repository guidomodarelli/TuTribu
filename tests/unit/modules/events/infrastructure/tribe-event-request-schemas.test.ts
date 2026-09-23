import { describe, expect, it } from "vitest";

import {
  tribeEventAttendanceBodySchema,
  tribeEventMonthQuerySchema,
  tribeEventMutationBodySchema,
  tribeEventOccurrenceQuerySchema,
  tribeEventRouteParamsSchema,
  tribeEventsRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  tribeEventsPageParamsSchema,
  tribeEventsPageSearchParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-events-page-schemas";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

const VALID_MUTATION_BODY = {
  capacity: "",
  description: "",
  endsAt: "",
  meetingUrl: "",
  recurrenceFrequency: "none",
  recurrenceUntil: "",
  startsAt: "2026-05-06T18:00:00.000Z",
  title: "Clase abierta",
};

/**
 * First issue message: the category the route maps to its Spanish copy.
 */
function readFirstIssue(result: { error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe("tribe event request schemas", () => {
  describe("route params", () => {
    it("accepts canonical slugs and uuid event ids", () => {
      expect(
        tribeEventRouteParamsSchema.parse({ eventId: EVENT_ID, slug: "matematica-pro" })
      ).toEqual({ eventId: EVENT_ID, slug: "matematica-pro" });
    });

    it("rejects malformed slugs and event ids", () => {
      for (const slug of ["", "Matematica", "mate matica", "-mate", "mate--pro", "../api"]) {
        expect(readFirstIssue(tribeEventsRouteParamsSchema.safeParse({ slug }))).toBe(
          "invalid_tribe_reference"
        );
      }

      for (const eventId of ["not-a-uuid", "", `${EVENT_ID}x`, " "]) {
        expect(
          readFirstIssue(
            tribeEventRouteParamsSchema.safeParse({ eventId, slug: "matematica-pro" })
          )
        ).toBe("invalid_event_reference");
      }
    });
  });

  describe("query", () => {
    it("accepts a missing or well-formed month", () => {
      expect(tribeEventMonthQuerySchema.parse({})).toEqual({});
      expect(tribeEventMonthQuerySchema.parse({ month: "2026-05" })).toEqual({
        month: "2026-05",
      });
    });

    it("rejects malformed or repeated months", () => {
      for (const month of ["2026-13", "2026-5", "not-a-month", "", ["2026-05", "2026-06"]]) {
        expect(readFirstIssue(tribeEventMonthQuerySchema.safeParse({ month }))).toBe(
          "invalid_month"
        );
      }
    });

    it("normalizes the occurrence instant and rejects anything else", () => {
      expect(
        tribeEventOccurrenceQuerySchema.parse({ occurrence: "2026-05-13T15:00:00-03:00" })
      ).toEqual({ occurrence: "2026-05-13T18:00:00.000Z" });

      for (const query of [{}, { occurrence: "" }, { occurrence: "2026-05-13" }, { occurrence: "yesterday" }]) {
        expect(readFirstIssue(tribeEventOccurrenceQuerySchema.safeParse(query))).toBe(
          "invalid_attendance"
        );
      }
    });
  });

  describe("event body", () => {
    it("trims text, turns empty optionals into null, and parses the capacity", () => {
      expect(
        tribeEventMutationBodySchema.parse({
          capacity: " 25 ",
          description: "  Repaso mensual  ",
          endsAt: "2026-05-06T19:00:00Z",
          meetingUrl: " https://meet.google.com/abc-defg-hij ",
          recurrenceFrequency: "weekly",
          recurrenceUntil: "2026-06-30T02:59:00.000Z",
          startsAt: " 2026-05-06T15:00:00-03:00 ",
          title: " Clase abierta ",
        })
      ).toEqual({
        capacity: 25,
        description: "Repaso mensual",
        endsAt: "2026-05-06T19:00:00.000Z",
        eventType: "live",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        recurrenceFrequency: "weekly",
        recurrenceUntil: "2026-06-30T02:59:00.000Z",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      });
    });

    it("treats missing, null, and blank optionals as empty", () => {
      expect(
        tribeEventMutationBodySchema.parse({
          capacity: null,
          description: "   ",
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        })
      ).toEqual({
        capacity: null,
        description: null,
        endsAt: null,
        eventType: "live",
        meetingUrl: null,
        recurrenceFrequency: "none",
        recurrenceUntil: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      });
    });

    it("drops fields outside the contract", () => {
      expect(
        tribeEventMutationBodySchema.parse({ ...VALID_MUTATION_BODY, tribeId: "other-tribe" })
      ).not.toHaveProperty("tribeId");
    });

    it.each([
      ["a missing body", null, "invalid_input"],
      ["a non-object body", "title=Clase", "invalid_input"],
      ["a blank title", { ...VALID_MUTATION_BODY, title: "   " }, "invalid_input"],
      ["a title that is not text", { ...VALID_MUTATION_BODY, title: 42 }, "invalid_input"],
      ["an oversized title", { ...VALID_MUTATION_BODY, title: "x".repeat(121) }, "invalid_input"],
      [
        "an oversized description",
        { ...VALID_MUTATION_BODY, description: "x".repeat(2001) },
        "invalid_input",
      ],
      ["a missing start", { ...VALID_MUTATION_BODY, startsAt: "" }, "invalid_input"],
      ["a malformed start", { ...VALID_MUTATION_BODY, startsAt: "mañana" }, "invalid_date"],
      ["a malformed end", { ...VALID_MUTATION_BODY, endsAt: "2026-13-45" }, "invalid_date"],
      [
        "an unknown frequency",
        { ...VALID_MUTATION_BODY, recurrenceFrequency: "daily" },
        "invalid_recurrence",
      ],
      [
        "a malformed until date",
        { ...VALID_MUTATION_BODY, recurrenceUntil: "someday" },
        "invalid_recurrence",
      ],
      ["a meeting link that is not text", { ...VALID_MUTATION_BODY, meetingUrl: 1 }, "invalid_meeting_url"],
    ])("rejects %s", (_caseName, body, expectedIssue) => {
      expect(readFirstIssue(tribeEventMutationBodySchema.safeParse(body))).toBe(expectedIssue);
    });

    it("rejects capacities that are not whole numbers between 1 and 10000", () => {
      for (const capacity of ["0", "-3", "2.5", "1e3", "10001", "diez", 25]) {
        expect(
          readFirstIssue(tribeEventMutationBodySchema.safeParse({ ...VALID_MUTATION_BODY, capacity }))
        ).toBe("invalid_capacity");
      }
    });
  });

  describe("attendance body", () => {
    it("accepts the answers a member can pick", () => {
      for (const status of ["going", "maybe", "not_going"]) {
        expect(
          tribeEventAttendanceBodySchema.parse({
            occurrenceStartsAt: "2026-05-13T18:00:00Z",
            status,
          })
        ).toEqual({ occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status });
      }
    });

    it("rejects unknown answers, waitlisted, and malformed instants", () => {
      for (const body of [
        { occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status: "waitlisted" },
        { occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status: "perhaps" },
        { occurrenceStartsAt: "not-a-date", status: "going" },
        { status: "going" },
        null,
      ]) {
        expect(readFirstIssue(tribeEventAttendanceBodySchema.safeParse(body))).toBe(
          "invalid_attendance"
        );
      }
    });
  });

  describe("events page", () => {
    const occurrenceKey = `${EVENT_ID}@2026-06-10T18:00:00.000Z`;

    it("splits a valid deep link and keeps the first repeated value", () => {
      expect(
        tribeEventsPageSearchParamsSchema.parse({
          event: [occurrenceKey, "ignored"],
          month: ["2026-05", "2026-06"],
        })
      ).toEqual({
        event: {
          eventId: EVENT_ID,
          key: occurrenceKey,
          occurrenceStartsAt: "2026-06-10T18:00:00.000Z",
        },
        month: "2026-05",
      });
    });

    it("drops malformed values instead of failing the page", () => {
      for (const event of [
        "not-a-key",
        "not-a-uuid@2026-05-06T18:00:00.000Z",
        `${EVENT_ID}@2026-13-45`,
        `${EVENT_ID}@2026-05-06`,
        `${EVENT_ID}@2026-05-06T18:00:00Z`,
        [`${EVENT_ID}@yesterday`],
      ]) {
        expect(
          tribeEventsPageSearchParamsSchema.parse({ event, month: "not-a-month" })
        ).toEqual({ event: undefined, month: undefined });
      }
    });

    it("rejects malformed slugs in the page params", () => {
      expect(tribeEventsPageParamsSchema.safeParse({ slug: "Mate Pro" }).success).toBe(false);
      expect(tribeEventsPageParamsSchema.parse({ slug: "matematica-pro" })).toEqual({
        slug: "matematica-pro",
      });
    });
  });
});
