import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  approveTribeEventProposalRequest,
  createTribeEventProposalRequest,
  decideTribeEventProposalRequest,
  fetchTribeEventProposalsRequest,
} from "@/lib/events/tribe-event-proposals-api-client";
import {
  clearTribeEventOccurrenceExceptionRequest,
  saveTribeEventOccurrenceExceptionRequest,
} from "@/lib/events/tribe-events-api-client";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const PROPOSAL_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const ORIGINAL_STARTS_AT = "2026-05-14T21:00:00.000Z";

const proposal = {
  createdAt: "2026-05-01T12:00:00.000Z",
  description: null,
  durationMinutes: 90,
  eventId: null,
  eventType: "workshop",
  id: PROPOSAL_ID,
  proposerName: "Ana",
  reviewNote: null,
  reviewedAt: null,
  startsAt: "2026-05-20T21:00:00.000Z",
  status: "pending",
  title: "Taller de repaso",
};

/**
 * Answers the next request with a real `Response` so the adapter reads the
 * body exactly as in the browser.
 */
function respondWith(body: unknown, status = 200) {
  (globalThis.fetch as Mock).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );
}

describe("proposal and exception browser adapters", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // `fetch` is the transport port of these adapters; the DTO guards run for real.
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads the proposals panel and drops fields outside the contract", async () => {
    respondWith({
      canReviewProposals: false,
      proposals: [{ ...proposal, proposedBy: "member-secret" }],
    });

    await expect(
      fetchTribeEventProposalsRequest({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      canReviewProposals: false,
      isSuccess: true,
      message: null,
      proposals: [proposal],
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/events/proposals",
      expect.objectContaining({ signal: undefined })
    );
  });

  it("treats an unusable proposal body as a failure without message", async () => {
    respondWith({ message: "ok", proposal: { ...proposal, status: "accepted" } }, 201);

    await expect(
      createTribeEventProposalRequest({
        payload: {
          durationMinutes: 90,
          startsAt: proposal.startsAt,
          title: proposal.title,
        },
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ isSuccess: false, message: null });
  });

  it("returns the safe message of a failed approval and the new slots of a successful one", async () => {
    respondWith({ message: "Esta propuesta ya fue resuelta." }, 409);

    await expect(
      approveTribeEventProposalRequest({
        month: "2026-05",
        payload: {
          capacity: "",
          description: "",
          endsAt: "",
          eventType: "workshop",
          meetingUrl: "",
          recurrenceFrequency: "none",
          recurrenceUntil: "",
          startsAt: proposal.startsAt,
          title: proposal.title,
        },
        proposalId: PROPOSAL_ID,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ isSuccess: false, message: "Esta propuesta ya fue resuelta." });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/proposals/${PROPOSAL_ID}/approval?month=2026-05`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends decisions with PATCH", async () => {
    respondWith({ message: "Propuesta retirada.", proposal: { ...proposal, status: "withdrawn" } });

    await expect(
      decideTribeEventProposalRequest({
        body: { decision: "withdrawn" },
        proposalId: PROPOSAL_ID,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({ isSuccess: true, proposal: { status: "withdrawn" } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/proposals/${PROPOSAL_ID}`,
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("cancels and restores a date against the exceptions endpoint", async () => {
    respondWith({ message: "Fecha cancelada.", occurrences: [] });
    respondWith({ message: "Fecha restaurada.", occurrences: [] });

    await expect(
      saveTribeEventOccurrenceExceptionRequest({
        body: { kind: "cancelled", originalStartsAt: ORIGINAL_STARTS_AT },
        eventId: EVENT_ID,
        month: "2026-05",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ isSuccess: true, message: "Fecha cancelada.", occurrences: [] });
    await expect(
      clearTribeEventOccurrenceExceptionRequest({
        eventId: EVENT_ID,
        month: "2026-05",
        originalStartsAt: ORIGINAL_STARTS_AT,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ isSuccess: true, message: "Fecha restaurada.", occurrences: [] });
    expect((globalThis.fetch as Mock).mock.calls.map((call) => [call[0], call[1].method])).toEqual([
      [`/api/tribes/matematica-pro/events/${EVENT_ID}/exceptions?month=2026-05`, "PUT"],
      [
        `/api/tribes/matematica-pro/events/${EVENT_ID}/exceptions?occurrence=${encodeURIComponent(ORIGINAL_STARTS_AT)}&month=2026-05`,
        "DELETE",
      ],
    ]);
  });
});
