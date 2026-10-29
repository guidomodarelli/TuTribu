import { tribeEventProposalApprovalResponseSchema } from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventProposalApprovalQuerySchema,
  tribeEventProposalRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-proposal-request-schemas";
import { tribeEventMutationBodySchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventProposalStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { handleTribeEventRoute, openTribeEventScope } from "../../../tribe-event-route";

const APPROVAL_ROUTE_LOG = {
  failureMessage: "Tribe event proposal approval failed",
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
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: APPROVAL_ROUTE_LOG.failureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalReviewMessage,
      },
      openScope: openTribeEventScope(APPROVAL_ROUTE_LOG.operation),
      readLogMetadata: ({ params }) => ({ proposalId: params.proposalId, slug: params.slug }),
      schemas: {
        body: tribeEventMutationBodySchema,
        params: tribeEventProposalRouteParamsSchema,
        query: tribeEventProposalApprovalQuerySchema,
      },
    },
    async ({ body, modules, params, query, respond }) => {
      const result = await modules.events.useCases.approveTribeEventProposal({
        ...body,
        proposalId: params.proposalId,
        tribeSlug: params.slug,
        visibleMonth: query.month ?? null,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.proposalApproved) {
        return mapTribeEventProposalStatusResponse(
          result.status,
          TRIBE_EVENT_ROUTE_RESPONSE.proposalReviewForbiddenMessage
        );
      }

      return respond(
        {
          event: result.event,
          message: TRIBE_EVENT_ROUTE_RESPONSE.proposalApprovedMessage,
          occurrences: result.occurrences,
          proposal: result.proposal,
        },
        tribeEventProposalApprovalResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.created,
        { eventId: result.event.id }
      );
    }
  );
}
