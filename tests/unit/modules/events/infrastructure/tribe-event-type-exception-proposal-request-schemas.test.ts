import { describe, expect, it } from "vitest";

import {
  tribeEventExceptionClearQuerySchema,
  tribeEventOccurrenceExceptionBodySchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-exception-request-schemas";
import {
  tribeEventProposalBodySchema,
  tribeEventProposalDecisionBodySchema,
  tribeEventProposalRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-proposal-request-schemas";
import {
  tribeEventListQuerySchema,
  tribeEventMutationBodySchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import { tribeEventsPageSearchParamsSchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-events-page-schemas";

const PROPOSAL_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";

function readFirstIssue(result: { error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe("event type input", () => {
  it("defaults a missing type and rejects one outside the catalog", () => {
    const body = {
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
    };

    expect(tribeEventMutationBodySchema.parse(body).eventType).toBe("live");
    expect(tribeEventMutationBodySchema.parse({ ...body, eventType: "qa" }).eventType).toBe("qa");
    expect(
      readFirstIssue(tribeEventMutationBodySchema.safeParse({ ...body, eventType: "party" }))
    ).toBe("invalid_event_type");
  });

  it("accepts repeated or comma-separated types in the API list query and rejects unknown ones", () => {
    expect(tribeEventListQuerySchema.parse({ type: ["live", "qa"] })).toEqual({
      type: ["live", "qa"],
    });
    expect(tribeEventListQuerySchema.parse({ type: "social,live,social" })).toEqual({
      type: ["social", "live"],
    });
    expect(tribeEventListQuerySchema.parse({ month: "2026-05" })).toEqual({ month: "2026-05" });
    expect(readFirstIssue(tribeEventListQuerySchema.safeParse({ type: "live,party" }))).toBe(
      "invalid_event_type"
    );
  });

  it("ignores unknown types on the page instead of failing", () => {
    expect(
      tribeEventsPageSearchParamsSchema.parse({ type: ["workshop,party", "workshop", "qa"] })
    ).toEqual({ type: ["workshop", "qa"] });
    expect(tribeEventsPageSearchParamsSchema.parse({ type: "party" })).toEqual({ type: [] });
  });
});

describe("occurrence exception input", () => {
  it("normalizes a moved date and requires its new start", () => {
    expect(
      tribeEventOccurrenceExceptionBodySchema.parse({
        kind: "moved",
        newEndsAt: "",
        newStartsAt: "2026-05-15T18:00:00-03:00",
        originalStartsAt: "2026-05-14T21:00:00.000Z",
        reason: "  Feriado ",
      })
    ).toEqual({
      kind: "moved",
      newEndsAt: null,
      newStartsAt: "2026-05-15T21:00:00.000Z",
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      reason: "Feriado",
    });
    expect(
      readFirstIssue(
        tribeEventOccurrenceExceptionBodySchema.safeParse({
          kind: "moved",
          originalStartsAt: "2026-05-14T21:00:00.000Z",
        })
      )
    ).toBe("invalid_move");
  });

  it("drops new times from a cancelled date", () => {
    expect(
      tribeEventOccurrenceExceptionBodySchema.parse({
        kind: "cancelled",
        newStartsAt: "2026-05-15T21:00:00.000Z",
        originalStartsAt: "2026-05-14T21:00:00.000Z",
      })
    ).toEqual({
      kind: "cancelled",
      newEndsAt: null,
      newStartsAt: null,
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      reason: null,
    });
  });

  it("rejects unknown kinds, malformed originals, and long reasons", () => {
    const valid = { kind: "cancelled", originalStartsAt: "2026-05-14T21:00:00.000Z" };

    expect(
      readFirstIssue(tribeEventOccurrenceExceptionBodySchema.safeParse({ ...valid, kind: "skip" }))
    ).toBe("invalid_exception");
    expect(
      readFirstIssue(
        tribeEventOccurrenceExceptionBodySchema.safeParse({ ...valid, originalStartsAt: "ayer" })
      )
    ).toBe("invalid_exception");
    expect(
      readFirstIssue(
        tribeEventOccurrenceExceptionBodySchema.safeParse({ ...valid, reason: "x".repeat(281) })
      )
    ).toBe("invalid_input");
    expect(readFirstIssue(tribeEventExceptionClearQuerySchema.safeParse({}))).toBe(
      "invalid_exception"
    );
  });
});

describe("proposal input", () => {
  const validProposal = {
    description: "",
    durationMinutes: 90,
    eventType: "workshop",
    startsAt: "2026-05-20T18:00:00-03:00",
    title: "  Taller de repaso ",
  };

  it("normalizes the reduced form", () => {
    expect(tribeEventProposalBodySchema.parse(validProposal)).toEqual({
      description: null,
      durationMinutes: 90,
      eventType: "workshop",
      startsAt: "2026-05-20T21:00:00.000Z",
      title: "Taller de repaso",
    });
  });

  it("rejects missing titles and durations out of bounds", () => {
    for (const body of [
      { ...validProposal, title: "  " },
      { ...validProposal, durationMinutes: 5 },
      { ...validProposal, durationMinutes: 481 },
      { ...validProposal, durationMinutes: "90" },
    ]) {
      expect(readFirstIssue(tribeEventProposalBodySchema.safeParse(body))).toBe(
        "invalid_proposal"
      );
    }
  });

  it("validates the proposal id and the decision body", () => {
    expect(
      readFirstIssue(
        tribeEventProposalRouteParamsSchema.safeParse({ proposalId: "1", slug: "matematica-pro" })
      )
    ).toBe("invalid_proposal_reference");
    expect(
      tribeEventProposalDecisionBodySchema.parse({ decision: "rejected", reviewNote: " " })
    ).toEqual({ decision: "rejected", reviewNote: null });
    expect(
      readFirstIssue(tribeEventProposalDecisionBodySchema.safeParse({ decision: "approved" }))
    ).toBe("invalid_proposal");
    expect(
      readFirstIssue(
        tribeEventProposalDecisionBodySchema.safeParse({
          decision: "rejected",
          reviewNote: "x".repeat(501),
        })
      )
    ).toBe("invalid_review_note");
    expect(
      tribeEventProposalRouteParamsSchema.parse({ proposalId: PROPOSAL_ID, slug: "matematica-pro" })
    ).toEqual({ proposalId: PROPOSAL_ID, slug: "matematica-pro" });
  });
});
