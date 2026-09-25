import { tribeEventProposalResponseSchema } from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_PROPOSAL_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventProposalDecisionBodySchema,
  tribeEventProposalRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-proposal-request-schemas";
import { tribeEventEmptyQuerySchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
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

const PROPOSAL_ROUTE_LOG = {
  decisionFailureMessage: "Tribe event proposal decision failed",
  feature: "events",
  operation: "tribe-event-proposal-decision",
} as const;

type TribeEventProposalRouteContext = {
  params: Promise<{
    proposalId: string;
    slug: string;
  }>;
};

/**
 * Resolves a pending proposal without creating an event: a manager rejects
 * it (optional note for the author) or the author withdraws it. 409 when it
 * is no longer pending.
 */
export async function PATCH(request: Request, context: TribeEventProposalRouteContext) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: PROPOSAL_ROUTE_LOG.feature,
    operation: PROPOSAL_ROUTE_LOG.operation,
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
      body: tribeEventProposalDecisionBodySchema,
      params: tribeEventProposalRouteParamsSchema,
      query: tribeEventEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { proposalId, slug } = input.params;
  const isRejection = input.body.decision === TRIBE_EVENT_PROPOSAL_STATUS.rejected;
  const logMetadata = {
    decision: input.body.decision,
    proposalId,
    slug,
    viewerId: authenticatedMember.id,
  };

  try {
    const result = isRejection
      ? await modules.events.useCases.rejectTribeEventProposal({
          proposalId,
          reviewNote: input.body.reviewNote,
          tribeSlug: slug,
        })
      : await modules.events.useCases.withdrawTribeEventProposal({
          proposalId,
          tribeSlug: slug,
        });

    if (
      result.status !== TRIBE_EVENT_MUTATION_STATUS.proposalRejected &&
      result.status !== TRIBE_EVENT_MUTATION_STATUS.proposalWithdrawn
    ) {
      return mapTribeEventProposalStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.proposalReviewForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: {
        message: isRejection
          ? TRIBE_EVENT_ROUTE_RESPONSE.proposalRejectedMessage
          : TRIBE_EVENT_ROUTE_RESPONSE.proposalWithdrawnMessage,
        proposal: result.proposal,
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalReviewMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventProposalResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      message: PROPOSAL_ROUTE_LOG.decisionFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalReviewMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
