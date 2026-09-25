import { tribeEventProposalApprovalResponseSchema } from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventProposalApprovalQuerySchema,
  tribeEventProposalRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-proposal-request-schemas";
import { tribeEventMutationBodySchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import { createTribeEventPublicResponse } from "@/src/modules/events/infrastructure/api/tribe-event-public-response";
import { parseTribeEventRouteInput } from "@/src/modules/events/infrastructure/api/tribe-event-route-input";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
  mapTribeEventProposalStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const APPROVAL_ROUTE_LOG = {
  failureMessage: "Tribe event proposal approval failed",
  feature: "events",
  operation: "tribe-event-proposal-approval",
} as const;

type TribeEventProposalRouteContext = {
  params: Promise<{
    proposalId: string;
    slug: string;
  }>;
};

/**
 * Approves a proposal with the event fields the manager confirmed (same body
 * as creating an event). The event and the resolution are written in one
 * transaction under the proposal row lock, so a double click or two managers
 * approving at once create a single event; the loser gets a 409.
 */
export async function POST(request: Request, context: TribeEventProposalRouteContext) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: APPROVAL_ROUTE_LOG.feature,
    operation: APPROVAL_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
    );
  }

  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      body: tribeEventMutationBodySchema,
      params: tribeEventProposalRouteParamsSchema,
      query: tribeEventProposalApprovalQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { proposalId, slug } = input.params;
  const logMetadata = { proposalId, slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.approveTribeEventProposal({
      ...input.body,
      proposalId,
      tribeSlug: slug,
      visibleMonth: input.query.month ?? null,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.proposalApproved) {
      return mapTribeEventProposalStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.proposalReviewForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: {
        event: result.event,
        message: TRIBE_EVENT_ROUTE_RESPONSE.proposalApprovedMessage,
        occurrences: result.occurrences,
        proposal: result.proposal,
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalReviewMessage,
      logger,
      metadata: { ...logMetadata, eventId: result.event.id },
      schema: tribeEventProposalApprovalResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.created,
    });
  } catch (error) {
    logger.error({
      message: APPROVAL_ROUTE_LOG.failureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalReviewMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
