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
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventProposalStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { handleTribeEventRoute, openTribeEventScope } from "../../tribe-event-route";

const PROPOSAL_ROUTE_LOG = {
  decisionFailureMessage: "Tribe event proposal decision failed",
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
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: PROPOSAL_ROUTE_LOG.decisionFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedProposalReviewMessage,
      },
      openScope: openTribeEventScope(PROPOSAL_ROUTE_LOG.operation),
      readLogMetadata: ({ body, params }) => ({
        decision: body.decision,
        proposalId: params.proposalId,
        slug: params.slug,
      }),
      schemas: {
        body: tribeEventProposalDecisionBodySchema,
        params: tribeEventProposalRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    async ({ body, modules, params, respond }) => {
      const { proposalId, slug } = params;
      const isRejection = body.decision === TRIBE_EVENT_PROPOSAL_STATUS.rejected;
      const result = isRejection
        ? await modules.events.useCases.rejectTribeEventProposal({
            proposalId,
            reviewNote: body.reviewNote,
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

      return respond(
        {
          message: isRejection
            ? TRIBE_EVENT_ROUTE_RESPONSE.proposalRejectedMessage
            : TRIBE_EVENT_ROUTE_RESPONSE.proposalWithdrawnMessage,
          proposal: result.proposal,
        },
        tribeEventProposalResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }
  );
}
