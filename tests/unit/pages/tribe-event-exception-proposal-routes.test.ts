import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  DELETE as DELETE_EXCEPTION,
  PUT as PUT_EXCEPTION,
} from "@/app/api/tribes/[slug]/events/[eventId]/exceptions/route";
import { GET as GET_EVENTS } from "@/app/api/tribes/[slug]/events/route";
import {
  GET as GET_PROPOSALS,
  POST as POST_PROPOSAL,
} from "@/app/api/tribes/[slug]/events/proposals/route";
import { PATCH as PATCH_PROPOSAL } from "@/app/api/tribes/[slug]/events/proposals/[proposalId]/route";
import { POST as POST_APPROVAL } from "@/app/api/tribes/[slug]/events/proposals/[proposalId]/approval/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();
const useCases = {
  approveTribeEventProposal: vi.fn(),
  clearTribeEventOccurrenceException: vi.fn(),
  createTribeEventProposal: vi.fn(),
  listTribeEventProposals: vi.fn(),
  listTribeEvents: vi.fn(),
  rejectTribeEventProposal: vi.fn(),
  saveTribeEventOccurrenceException: vi.fn(),
  withdrawTribeEventProposal: vi.fn(),
};
const logError = vi.fn();
const logWarn = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

// The logger writes to the console; the double lets the tests assert what is
// logged (issue paths and codes, never the rejected values).
vi.mock("@/src/modules/shared/infrastructure/observability/server-logger", () => ({
  createServerLogger: vi.fn(() => ({ error: logError, info: vi.fn(), warn: logWarn })),
}));

class MockResponse {
  headers: Headers;
  status: number;

  constructor(
    private readonly body: Record<string, unknown> | string,
    init?: ResponseInit
  ) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers);
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const PROPOSAL_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const TRIBE_SLUG = "matematica-pro";
const BASE_URL = `https://tutribu.example.com/api/tribes/${TRIBE_SLUG}/events`;
const ORIGINAL_STARTS_AT = "2026-05-14T21:00:00.000Z";

function buildRequest(body: unknown, url: string): Request {
  return {
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
    url,
  } as unknown as Request;
}

function eventContext() {
  return { params: Promise.resolve({ eventId: EVENT_ID, slug: TRIBE_SLUG }) };
}

function tribeContext() {
  return { params: Promise.resolve({ slug: TRIBE_SLUG }) };
}

function proposalContext(proposalId = PROPOSAL_ID) {
  return { params: Promise.resolve({ proposalId, slug: TRIBE_SLUG }) };
}

const occurrence = {
  attendance: {
    goingCount: 0,
    goingPreview: [],
    maybeCount: 0,
    viewerStatus: null,
    viewerWaitlistPosition: null,
    waitlistedCount: 0,
  },
  capacity: null,
  description: null,
  endsAt: "2026-05-14T22:00:00.000Z",
  eventId: EVENT_ID,
  eventType: "workshop",
  exception: { kind: "cancelled", reason: "Feriado" },
  meetingUrl: null,
  occurrenceKey: `${EVENT_ID}@${ORIGINAL_STARTS_AT}`,
  originalStartsAt: ORIGINAL_STARTS_AT,
  recurrenceFrequency: "weekly",
  recurrenceRule: "FREQ=WEEKLY",
  recurrenceUntil: null,
  seriesEndsAt: "2026-05-07T22:00:00.000Z",
  seriesStartsAt: "2026-05-07T21:00:00.000Z",
  startsAt: ORIGINAL_STARTS_AT,
  title: "Taller semanal",
};

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
 * A public error body carries only the safe message.
 */
async function expectSafeErrorBody(response: Response, message: string) {
  const body = await response.json();

  expect(body).toEqual({ message });
  expect(JSON.stringify(body)).not.toMatch(/issues|invalid_|expected|received|zod/i);
}

describe("occurrence exception and proposal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.Response = MockResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({ id: "member-1" });
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      events: { useCases },
    });
  });

  describe("PUT and DELETE /exceptions", () => {
    it("cancels a date and answers with the validated month occurrences", async () => {
      useCases.saveTribeEventOccurrenceException.mockResolvedValue({
        occurrences: [{ ...occurrence, internalNote: "leak" }],
        status: "exception_saved",
      });

      const response = await PUT_EXCEPTION(
        buildRequest(
          { kind: "cancelled", originalStartsAt: ORIGINAL_STARTS_AT, reason: "Feriado" },
          `${BASE_URL}/${EVENT_ID}/exceptions?month=2026-05`
        ),
        eventContext()
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        message: "Fecha cancelada.",
        occurrences: [occurrence],
      });
      expect(useCases.saveTribeEventOccurrenceException).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        kind: "cancelled",
        newEndsAt: null,
        newStartsAt: null,
        originalStartsAt: ORIGINAL_STARTS_AT,
        reason: "Feriado",
        tribeSlug: TRIBE_SLUG,
        visibleMonth: "2026-05",
      });
    });

    it("rejects a move without a new start before calling the use case", async () => {
      const response = await PUT_EXCEPTION(
        buildRequest(
          { kind: "moved", originalStartsAt: ORIGINAL_STARTS_AT },
          `${BASE_URL}/${EVENT_ID}/exceptions?month=2026-05`
        ),
        eventContext()
      );

      expect(response.status).toBe(400);
      await expectSafeErrorBody(
        response,
        "Elegí la nueva fecha y hora de inicio de la fecha que movés."
      );
      expect(useCases.saveTribeEventOccurrenceException).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { issues: [{ code: "custom", path: "newStartsAt" }], part: "body" },
        })
      );
    });

    it("maps a date that is not part of a series and members who cannot manage", async () => {
      useCases.saveTribeEventOccurrenceException
        .mockResolvedValueOnce({ status: "invalid_occurrence" })
        .mockResolvedValueOnce({ status: "forbidden" });
      const request = () =>
        buildRequest(
          { kind: "cancelled", originalStartsAt: ORIGINAL_STARTS_AT },
          `${BASE_URL}/${EVENT_ID}/exceptions`
        );

      const invalid = await PUT_EXCEPTION(request(), eventContext());
      const forbidden = await PUT_EXCEPTION(request(), eventContext());

      expect(invalid.status).toBe(400);
      await expectSafeErrorBody(invalid, "Elegí una fecha válida de un evento que se repite.");
      expect(forbidden.status).toBe(403);
      await expectSafeErrorBody(forbidden, "No tenés permisos para gestionar eventos.");
    });

    it("restores a date from the occurrence query", async () => {
      useCases.clearTribeEventOccurrenceException.mockResolvedValue({
        occurrences: [],
        status: "exception_cleared",
      });

      const response = await DELETE_EXCEPTION(
        buildRequest(
          undefined,
          `${BASE_URL}/${EVENT_ID}/exceptions?occurrence=${encodeURIComponent(ORIGINAL_STARTS_AT)}&month=2026-05`
        ),
        eventContext()
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        message: "Fecha restaurada.",
        occurrences: [],
      });
      expect(useCases.clearTribeEventOccurrenceException).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        originalStartsAt: ORIGINAL_STARTS_AT,
        tribeSlug: TRIBE_SLUG,
        visibleMonth: "2026-05",
      });
    });

    it("hides unexpected failures behind a safe message", async () => {
      useCases.saveTribeEventOccurrenceException.mockRejectedValue(new Error("pool exhausted"));

      const response = await PUT_EXCEPTION(
        buildRequest(
          { kind: "cancelled", originalStartsAt: ORIGINAL_STARTS_AT },
          `${BASE_URL}/${EVENT_ID}/exceptions`
        ),
        eventContext()
      );

      expect(response.status).toBe(500);
      await expectSafeErrorBody(response, "No pudimos actualizar la fecha. Intentá de nuevo.");
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ eventId: EVENT_ID }) })
      );
    });
  });

  describe("GET /events type filter", () => {
    it("forwards the validated types and rejects unknown ones", async () => {
      useCases.listTribeEvents.mockResolvedValue({
        events: [],
        month: { current: "2026-05", next: "2026-06", previous: "2026-04" },
        pendingProposalCount: 0,
        recordedOccurrenceKeys: [],
        selectedOccurrenceKey: null,
        viewerPermissions: { canManageEvents: false, canProposeEvents: true },
      });

      const listed = await GET_EVENTS(
        buildRequest(undefined, `${BASE_URL}?month=2026-05&type=workshop&type=qa,workshop`),
        tribeContext()
      );
      const rejected = await GET_EVENTS(
        buildRequest(undefined, `${BASE_URL}?type=party`),
        tribeContext()
      );

      expect(listed.status).toBe(200);
      expect(useCases.listTribeEvents).toHaveBeenCalledWith({
        eventTypes: ["workshop", "qa"],
        month: "2026-05",
        occurrence: null,
        tribeSlug: TRIBE_SLUG,
      });
      expect(rejected.status).toBe(400);
      await expectSafeErrorBody(rejected, "Elegí un tipo de evento válido.");
    });
  });

  describe("proposals", () => {
    const proposalBody = {
      description: "",
      durationMinutes: 90,
      eventType: "workshop",
      startsAt: "2026-05-20T18:00:00-03:00",
      title: "Taller de repaso",
    };

    it("creates a proposal and returns only the public fields", async () => {
      useCases.createTribeEventProposal.mockResolvedValue({
        proposal: { ...proposal, proposedBy: "member-1" },
        status: "proposal_created",
      });

      const response = await POST_PROPOSAL(
        buildRequest(proposalBody, `${BASE_URL}/proposals`),
        tribeContext()
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        message: "Propuesta enviada. Quienes gestionan eventos la van a revisar.",
        proposal,
      });
      expect(useCases.createTribeEventProposal).toHaveBeenCalledWith({
        description: null,
        durationMinutes: 90,
        eventType: "workshop",
        startsAt: "2026-05-20T21:00:00.000Z",
        title: "Taller de repaso",
        tribeSlug: TRIBE_SLUG,
      });
    });

    it("answers 409 when the member reached the pending cap and 403 for non members", async () => {
      useCases.createTribeEventProposal
        .mockResolvedValueOnce({ status: "proposal_limit_reached" })
        .mockResolvedValueOnce({ status: "forbidden" });

      const limited = await POST_PROPOSAL(
        buildRequest(proposalBody, `${BASE_URL}/proposals`),
        tribeContext()
      );
      const forbidden = await POST_PROPOSAL(
        buildRequest(proposalBody, `${BASE_URL}/proposals`),
        tribeContext()
      );

      expect(limited.status).toBe(409);
      await expectSafeErrorBody(
        limited,
        "Ya tenés 3 propuestas pendientes. Esperá a que las revisen o retirá alguna."
      );
      expect(forbidden.status).toBe(403);
      await expectSafeErrorBody(forbidden, "Solo los miembros activos pueden proponer encuentros.");
    });

    it("rejects an invalid proposal body at the boundary", async () => {
      const response = await POST_PROPOSAL(
        buildRequest({ ...proposalBody, durationMinutes: 1000 }, `${BASE_URL}/proposals`),
        tribeContext()
      );

      expect(response.status).toBe(400);
      await expectSafeErrorBody(
        response,
        "Completá el título, la fecha y una duración válida de la propuesta."
      );
      expect(useCases.createTribeEventProposal).not.toHaveBeenCalled();
    });

    it("lists the proposals panel", async () => {
      useCases.listTribeEventProposals.mockResolvedValue({
        canReviewProposals: true,
        pendingCount: 73,
        proposals: [proposal],
        status: "found",
      });

      const response = await GET_PROPOSALS(
        buildRequest(undefined, `${BASE_URL}/proposals`),
        tribeContext()
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        canReviewProposals: true,
        pendingCount: 73,
        proposals: [proposal],
      });
    });

    it("approves a proposal and answers 409 when another approval already resolved it", async () => {
      useCases.approveTribeEventProposal
        .mockResolvedValueOnce({
          event: {
            capacity: null,
            description: null,
            endsAt: "2026-05-20T22:30:00.000Z",
            eventType: "workshop",
            id: EVENT_ID,
            meetingUrl: null,
            recurrenceFrequency: "none",
            recurrenceRule: null,
            recurrenceUntil: null,
            startsAt: "2026-05-20T21:00:00.000Z",
            title: "Taller de repaso",
          },
          occurrences: [],
          proposal: { ...proposal, eventId: EVENT_ID, status: "approved" },
          status: "proposal_approved",
        })
        .mockResolvedValueOnce({ status: "proposal_resolved" });
      const approvalBody = {
        endsAt: "2026-05-20T22:30:00.000Z",
        eventType: "workshop",
        startsAt: "2026-05-20T21:00:00.000Z",
        title: "Taller de repaso",
      };

      const approved = await POST_APPROVAL(
        buildRequest(approvalBody, `${BASE_URL}/proposals/${PROPOSAL_ID}/approval?month=2026-05`),
        proposalContext()
      );
      const repeated = await POST_APPROVAL(
        buildRequest(approvalBody, `${BASE_URL}/proposals/${PROPOSAL_ID}/approval?month=2026-05`),
        proposalContext()
      );

      expect(approved.status).toBe(201);
      await expect(approved.json()).resolves.toMatchObject({
        event: { id: EVENT_ID },
        message: "Propuesta aprobada: el evento ya está en el calendario.",
        proposal: { status: "approved" },
      });
      expect(useCases.approveTribeEventProposal).toHaveBeenCalledWith(
        expect.objectContaining({ proposalId: PROPOSAL_ID, visibleMonth: "2026-05" })
      );
      expect(repeated.status).toBe(409);
      await expectSafeErrorBody(repeated, "Esta propuesta ya fue resuelta.");
    });

    it("rejects with a note, lets the author withdraw, and validates the proposal id", async () => {
      useCases.rejectTribeEventProposal.mockResolvedValue({
        proposal: { ...proposal, reviewNote: "Ya hay otro taller", status: "rejected" },
        status: "proposal_rejected",
      });
      useCases.withdrawTribeEventProposal.mockResolvedValue({ status: "not_found" });

      const rejected = await PATCH_PROPOSAL(
        buildRequest(
          { decision: "rejected", reviewNote: "Ya hay otro taller" },
          `${BASE_URL}/proposals/${PROPOSAL_ID}`
        ),
        proposalContext()
      );
      const withdrawn = await PATCH_PROPOSAL(
        buildRequest({ decision: "withdrawn" }, `${BASE_URL}/proposals/${PROPOSAL_ID}`),
        proposalContext()
      );
      const malformed = await PATCH_PROPOSAL(
        buildRequest({ decision: "withdrawn" }, `${BASE_URL}/proposals/1`),
        proposalContext("1")
      );

      expect(rejected.status).toBe(200);
      await expect(rejected.json()).resolves.toMatchObject({
        message: "Propuesta rechazada.",
        proposal: { reviewNote: "Ya hay otro taller" },
      });
      expect(withdrawn.status).toBe(404);
      await expectSafeErrorBody(withdrawn, "No pudimos encontrar la propuesta.");
      expect(malformed.status).toBe(400);
      await expectSafeErrorBody(malformed, "No pudimos encontrar la propuesta.");
      expect(useCases.withdrawTribeEventProposal).toHaveBeenCalledTimes(1);
    });

    it("requires a session", async () => {
      getAuthenticatedMember.mockResolvedValue(null);

      const response = await POST_PROPOSAL(
        buildRequest(proposalBody, `${BASE_URL}/proposals`),
        tribeContext()
      );

      expect(response.status).toBe(401);
      expect(useCases.createTribeEventProposal).not.toHaveBeenCalled();
    });
  });
});
