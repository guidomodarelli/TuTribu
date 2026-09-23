import { describe, expect, it } from "vitest";

import {
  tribeEventAttendanceReportResponseSchema,
  tribeEventAttendanceResponseSchema,
  tribeEventAttendanceStreakSchema,
  tribeEventExceptionResponseSchema,
  tribeEventListResponseSchema,
  tribeEventMessageResponseSchema,
  tribeEventProposalListResponseSchema,
  tribeEventSaveResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const STARTS_AT = "2026-05-06T18:00:00.000Z";

const attendance = {
  goingCount: 1,
  goingPreview: [{ id: "member-1", image: "https://cdn.example.com/a.png", name: "Ana" }],
  maybeCount: 0,
  viewerStatus: "waitlisted",
  viewerWaitlistPosition: 2,
  waitlistedCount: 2,
};
const occurrence = {
  attendance,
  capacity: 1,
  description: "Repaso",
  endsAt: "2026-05-06T19:00:00.000Z",
  eventId: EVENT_ID,
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  eventType: "live",
  exception: null,
  occurrenceKey: `${EVENT_ID}@${STARTS_AT}`,
  originalStartsAt: STARTS_AT,
  recurrenceFrequency: "biweekly",
  recurrenceRule: "FREQ=WEEKLY;INTERVAL=2",
  recurrenceUntil: null,
  seriesEndsAt: "2026-05-06T19:00:00.000Z",
  seriesStartsAt: STARTS_AT,
  startsAt: STARTS_AT,
  title: "Clase abierta",
};
const listing = {
  events: [occurrence],
  month: { current: "2026-05", next: "2026-06", previous: "2026-04" },
  pendingProposalCount: 0,
  selectedOccurrenceKey: occurrence.occurrenceKey,
  viewerPermissions: { canManageEvents: false, canProposeEvents: false },
};

describe("tribe event public DTO schemas", () => {
  it("accepts a complete listing and strips fields outside the allowlist", () => {
    const parsed = tribeEventListResponseSchema.parse({
      ...listing,
      events: [{ ...occurrence, attendance: { ...attendance, viewerEmail: "ana@example.com" } }],
      rawRows: [{ created_by: "user-1" }],
    });

    expect(parsed).toEqual(listing);
    expect(JSON.stringify(parsed)).not.toContain("ana@example.com");
  });

  it.each([
    ["an unknown recurrence", { ...listing, events: [{ ...occurrence, recurrenceFrequency: "daily" }] }],
    ["an unknown viewer status", {
      ...listing,
      events: [{ ...occurrence, attendance: { ...attendance, viewerStatus: "vip" } }],
    }],
    ["a negative count", {
      ...listing,
      events: [{ ...occurrence, attendance: { ...attendance, goingCount: -1 } }],
    }],
    ["a non-instant start", { ...listing, events: [{ ...occurrence, startsAt: "mañana" }] }],
    ["a malformed month", { ...listing, month: { ...listing.month, next: "2026-13" } }],
    ["missing permissions", { ...listing, viewerPermissions: undefined }],
    ["a missing selected key", { events: [], month: listing.month, viewerPermissions: { canManageEvents: true, canProposeEvents: false } }],
  ])("rejects a listing with %s", (_caseName, candidate) => {
    expect(tribeEventListResponseSchema.safeParse(candidate).success).toBe(false);
  });

  it("validates the save, attendance, message, and report bodies", () => {
    expect(
      tribeEventSaveResponseSchema.safeParse({
        event: {
          capacity: null,
          description: null,
          endsAt: null,
          eventType: "live",
          id: EVENT_ID,
          meetingUrl: null,
          recurrenceFrequency: "none",
          recurrenceRule: null,
          recurrenceUntil: null,
          startsAt: STARTS_AT,
          title: "Clase abierta",
        },
        message: "Evento creado.",
        occurrences: [occurrence],
      }).success
    ).toBe(true);
    expect(tribeEventSaveResponseSchema.safeParse({ message: "Evento creado." }).success).toBe(
      false
    );
    expect(
      tribeEventAttendanceResponseSchema.safeParse({ attendance, message: "Respuesta guardada." })
        .success
    ).toBe(true);
    expect(tribeEventMessageResponseSchema.safeParse({ message: 1 }).success).toBe(false);
    expect(
      tribeEventAttendanceReportResponseSchema.safeParse({
        report: {
          attendeeGroups: {
            going: [],
            maybe: [],
            notGoing: [{ name: "Beto", respondedAt: STARTS_AT, status: "not_going" }],
            waitlisted: [],
          },
          eventTitle: "Clase abierta",
          occurrenceStartsAt: STARTS_AT,
          trend: [],
        },
      }).success
    ).toBe(true);
    expect(
      tribeEventAttendanceReportResponseSchema.safeParse({
        report: {
          attendeeGroups: { going: [{ name: "Ana", respondedAt: STARTS_AT, status: "maybe?" }] },
        },
      }).success
    ).toBe(false);
  });

  it("accepts a hidden or complete streak only", () => {
    expect(tribeEventAttendanceStreakSchema.parse(null)).toBeNull();
    expect(
      tribeEventAttendanceStreakSchema.parse({ attendedCount: 4, occurrenceCount: 5 })
    ).toEqual({ attendedCount: 4, occurrenceCount: 5 });
    expect(
      tribeEventAttendanceStreakSchema.safeParse({ attendedCount: 4.5, occurrenceCount: 5 })
        .success
    ).toBe(false);
  });

  it("rejects occurrences with an unknown type or exception and proposals with an unknown status", () => {
    expect(
      tribeEventExceptionResponseSchema.safeParse({
        message: "Fecha cancelada.",
        occurrences: [{ ...occurrence, exception: { kind: "cancelled", reason: null } }],
      }).success
    ).toBe(true);
    expect(
      tribeEventExceptionResponseSchema.safeParse({
        message: "Fecha cancelada.",
        occurrences: [{ ...occurrence, exception: { kind: "skipped", reason: null } }],
      }).success
    ).toBe(false);
    expect(
      tribeEventListResponseSchema.safeParse({
        ...listing,
        events: [{ ...occurrence, eventType: "party" }],
      }).success
    ).toBe(false);

    const proposal = {
      createdAt: STARTS_AT,
      description: null,
      durationMinutes: 60,
      eventId: null,
      eventType: "live",
      id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
      proposerName: null,
      reviewNote: null,
      reviewedAt: null,
      startsAt: STARTS_AT,
      status: "pending",
      title: "Encuentro",
    };

    expect(
      tribeEventProposalListResponseSchema.parse({
        canReviewProposals: false,
        proposals: [{ ...proposal, proposedBy: "user-secret" }],
      })
    ).toEqual({ canReviewProposals: false, proposals: [proposal] });
    expect(
      tribeEventProposalListResponseSchema.safeParse({
        canReviewProposals: false,
        proposals: [{ ...proposal, status: "accepted" }],
      }).success
    ).toBe(false);
  });
});
