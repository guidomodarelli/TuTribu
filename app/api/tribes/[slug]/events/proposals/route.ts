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
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventProposalStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import {
  handleTribeEventRoute,
  openTribeEventScope,
  type TribeEventsRouteContext,
} from "../tribe-event-route";

const PROPOSALS_ROUTE_LOG = {
  createFailureMessage: "Tribe event proposal creation failed",
  listFailureMessage: "Tribe event proposal listing failed",
  operation: "tribe-event-proposals",
} as const;

/**
 * Proposals panel: managers get the pending queue of the tribe; members get
 * their own proposals.
 */
export async function GET(request: Request, context: TribeEventsRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: PROPOSALS_ROUTE_LOG.listFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalListMessage,
      },
      openScope: openTribeEventScope(PROPOSALS_ROUTE_LOG.operation),
      schemas: {
        params: tribeEventsRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    async ({ modules, params, respond }) => {
      const result = await modules.events.useCases.listTribeEventProposals({
        tribeSlug: params.slug,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
        return mapTribeEventProposalStatusResponse(
          result.status,
          TRIBE_EVENT_ROUTE_RESPONSE.proposalForbiddenMessage
        );
      }

      return respond(
        {
          canReviewProposals: result.canReviewProposals,
          pendingCount: result.pendingCount,
          proposals: result.proposals,
        },
        tribeEventProposalListResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }
  );
}

/**
 * "Proponer un encuentro" (active members). 409 when the member already has
 * the maximum of pending proposals.
 */
export async function POST(request: Request, context: TribeEventsRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: PROPOSALS_ROUTE_LOG.createFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalMessage,
      },
      openScope: openTribeEventScope(PROPOSALS_ROUTE_LOG.operation),
      schemas: {
        body: tribeEventProposalBodySchema,
        params: tribeEventsRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    async ({ body, modules, params, respond }) => {
      const result = await modules.events.useCases.createTribeEventProposal({
        ...body,
        tribeSlug: params.slug,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.proposalCreated) {
        return mapTribeEventProposalStatusResponse(
          result.status,
          TRIBE_EVENT_ROUTE_RESPONSE.proposalForbiddenMessage
        );
      }

      return respond(
        {
          message: TRIBE_EVENT_ROUTE_RESPONSE.proposalCreatedMessage,
          proposal: result.proposal,
        },
        tribeEventProposalResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.created,
        { proposalId: result.proposal.id }
      );
    }
  );
}
