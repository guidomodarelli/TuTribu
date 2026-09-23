import {
  TRIBE_EVENT_HTTP_REQUEST,
  TRIBE_EVENT_JSON_HEADERS,
  buildEventsEndpoint,
  readTribeEventResponse,
  type TribeEventRequestResult,
  type TribeEventSavePayload,
} from "@/lib/events/tribe-events-api-client";
import {
  tribeEventProposalApprovalResponseSchema,
  tribeEventProposalListResponseSchema,
  tribeEventProposalResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import type {
  TribeEventOccurrenceResult,
  TribeEventProposalListResult,
  TribeEventProposalResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import type {
  TribeEventProposalDecisionRequestBody,
  TribeEventProposalRequestBody,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-proposal-request-schemas";

/**
 * Browser adapter for the member proposal endpoints. Like the events client,
 * every body is validated with its public DTO schema before it is returned.
 */

export type TribeEventProposalPayload = TribeEventProposalRequestBody;

const PROPOSAL_ENDPOINT = {
  approvalPath: "/approval",
  monthQuery: "?month=",
  proposalsPath: "/proposals",
  separator: "/",
} as const;

function buildProposalsEndpoint(tribeSlug: string): string {
  return buildEventsEndpoint(tribeSlug) + PROPOSAL_ENDPOINT.proposalsPath;
}

function buildProposalEndpoint(tribeSlug: string, proposalId: string): string {
  return buildProposalsEndpoint(tribeSlug) + PROPOSAL_ENDPOINT.separator + proposalId;
}

/**
 * Loads the proposals panel (manager queue or the viewer's own proposals).
 *
 * @param input - Tribe and an abort signal so a stale load never updates the UI.
 * @returns The listing or the safe failure message.
 */
export async function fetchTribeEventProposalsRequest(input: {
  signal?: AbortSignal;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<TribeEventProposalListResult>> {
  const response = await fetch(buildProposalsEndpoint(input.tribeSlug), {
    signal: input.signal,
  });
  const result = await readTribeEventResponse(response, tribeEventProposalListResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: null, ...result.dto }
    : { isSuccess: false, message: result.message };
}

/**
 * Sends a meeting proposal.
 *
 * @param input - Tribe and the reduced form payload.
 * @returns The stored proposal or the failure message.
 */
export async function createTribeEventProposalRequest(input: {
  payload: TribeEventProposalPayload;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<{ proposal: TribeEventProposalResult }>> {
  const response = await fetch(buildProposalsEndpoint(input.tribeSlug), {
    body: JSON.stringify(input.payload),
    headers: TRIBE_EVENT_JSON_HEADERS,
    method: TRIBE_EVENT_HTTP_REQUEST.methodPost,
  });
  const result = await readTribeEventResponse(response, tribeEventProposalResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: result.dto.message, proposal: result.dto.proposal }
    : { isSuccess: false, message: result.message };
}

/**
 * Approves a proposal with the event fields the manager confirmed.
 *
 * @param input - Tribe, proposal, visible month, and the event payload.
 * @returns The new event slots of the visible month, or the failure message.
 */
export async function approveTribeEventProposalRequest(input: {
  month: string;
  payload: TribeEventSavePayload;
  proposalId: string;
  tribeSlug: string;
}): Promise<
  TribeEventRequestResult<{
    eventId: string;
    occurrences: TribeEventOccurrenceResult[];
    proposal: TribeEventProposalResult;
  }>
> {
  const response = await fetch(
    buildProposalEndpoint(input.tribeSlug, input.proposalId) +
      PROPOSAL_ENDPOINT.approvalPath +
      PROPOSAL_ENDPOINT.monthQuery +
      input.month,
    {
      body: JSON.stringify(input.payload),
      headers: TRIBE_EVENT_JSON_HEADERS,
      method: TRIBE_EVENT_HTTP_REQUEST.methodPost,
    }
  );
  const result = await readTribeEventResponse(
    response,
    tribeEventProposalApprovalResponseSchema
  );

  return result.isUsable
    ? {
        eventId: result.dto.event.id,
        isSuccess: true,
        message: result.dto.message,
        occurrences: result.dto.occurrences,
        proposal: result.dto.proposal,
      }
    : { isSuccess: false, message: result.message };
}

/**
 * Rejects (manager) or withdraws (author) a pending proposal.
 *
 * @param input - Tribe, proposal, and the decision body.
 * @returns The resolved proposal or the failure message.
 */
export async function decideTribeEventProposalRequest(input: {
  body: TribeEventProposalDecisionRequestBody;
  proposalId: string;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<{ proposal: TribeEventProposalResult }>> {
  const response = await fetch(buildProposalEndpoint(input.tribeSlug, input.proposalId), {
    body: JSON.stringify(input.body),
    headers: TRIBE_EVENT_JSON_HEADERS,
    method: TRIBE_EVENT_HTTP_REQUEST.methodPatch,
  });
  const result = await readTribeEventResponse(response, tribeEventProposalResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: result.dto.message, proposal: result.dto.proposal }
    : { isSuccess: false, message: result.message };
}
