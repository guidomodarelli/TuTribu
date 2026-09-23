import {
  tribeEventProposalListResponseSchema,
  tribeEventProposalResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { tribeEventProposalBodySchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-proposal-request-schemas";
import {
  tribeEventEmptyQuerySchema,
  tribeEventsRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
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

const PROPOSALS_ROUTE_LOG = {
  createFailureMessage: "Tribe event proposal creation failed",
  feature: "events",
  listFailureMessage: "Tribe event proposal listing failed",
  operation: "tribe-event-proposals",
} as const;

type TribeRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

function createRouteLogger(request: Request) {
  const { requestId } = resolveRequestContext(request.headers);

  return {
    logger: createServerLogger({
      feature: PROPOSALS_ROUTE_LOG.feature,
      operation: PROPOSALS_ROUTE_LOG.operation,
      requestId,
    }),
    requestId,
  };
}

/**
 * Proposals panel: managers get the pending queue of the tribe; members get
 * their own proposals.
 */
export async function GET(request: Request, context: TribeRouteContext) {
  const { logger, requestId } = createRouteLogger(request);
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
      params: tribeEventsRouteParamsSchema,
      query: tribeEventEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { slug } = input.params;
  const logMetadata = { slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.listTribeEventProposals({ tribeSlug: slug });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
      return mapTribeEventProposalStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.proposalForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: {
        canReviewProposals: result.canReviewProposals,
        proposals: result.proposals,
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalListMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventProposalListResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      message: PROPOSALS_ROUTE_LOG.listFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalListMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * "Proponer un encuentro" (active members). 409 when the member already has
 * the maximum of pending proposals.
 */
export async function POST(request: Request, context: TribeRouteContext) {
  const { logger, requestId } = createRouteLogger(request);
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
      body: tribeEventProposalBodySchema,
      params: tribeEventsRouteParamsSchema,
      query: tribeEventEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { slug } = input.params;
  const logMetadata = { slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.createTribeEventProposal({
      ...input.body,
      tribeSlug: slug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.proposalCreated) {
      return mapTribeEventProposalStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.proposalForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: {
        message: TRIBE_EVENT_ROUTE_RESPONSE.proposalCreatedMessage,
        proposal: result.proposal,
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalMessage,
      logger,
      metadata: { ...logMetadata, proposalId: result.proposal.id },
      schema: tribeEventProposalResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.created,
    });
  } catch (error) {
    logger.error({
      message: PROPOSALS_ROUTE_LOG.createFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
