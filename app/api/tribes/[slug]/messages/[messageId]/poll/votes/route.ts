import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const MESSAGE_POLL_VOTE_LOG = {
  feature: "messages",
  operation: "submit-message-poll-vote",
  voteFailureMessage: "Message poll vote failed",
} as const;

const MESSAGE_POLL_VOTE_FIELD = {
  optionIds: "optionIds",
} as const;

const MESSAGE_POLL_VOTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para votar esta encuesta.",
  invalidPollMessage: "Elegí al menos una opción para votar.",
  notFoundMessage: "No pudimos encontrar la encuesta.",
  successMessage: "Voto registrado.",
  unexpectedMessage: "No pudimos registrar tu voto. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para votar.",
} as const;

type SubmitMessagePollVoteResult = Awaited<
  ReturnType<RequestModules["messages"]["useCases"]["submitMessagePollVote"]>
>;

function createPostResultResponse(result: SubmitMessagePollVoteResult, slug: string): Response {
  switch (result.status) {
    case MESSAGE_MUTATION_STATUS.voted:
      revalidateTribeRoundCache(slug);

      return createRouteJsonResponse(
        {
          message: MESSAGE_POLL_VOTE_RESPONSE.successMessage,
          poll: result.poll,
        },
        HTTP_STATUS.ok
      );
    case MESSAGE_MUTATION_STATUS.invalidPoll:
      return createRouteJsonResponse(
        { message: MESSAGE_POLL_VOTE_RESPONSE.invalidPollMessage },
        HTTP_STATUS.badRequest
      );
    case MESSAGE_MUTATION_STATUS.notFound:
      return createRouteJsonResponse(
        { message: MESSAGE_POLL_VOTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case MESSAGE_MUTATION_STATUS.forbidden:
    default:
      return createRouteJsonResponse(
        { message: MESSAGE_POLL_VOTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

const MEMBER_ROUTE_SCOPE = {
  feature: MESSAGE_POLL_VOTE_LOG.feature,
  operation: MESSAGE_POLL_VOTE_LOG.operation,
  unauthorizedMessage: MESSAGE_POLL_VOTE_RESPONSE.unauthorizedMessage,
} as const;

export async function POST(
  request: Request,
  context: TribeRouteContext<{ messageId: string }>
) {
  const { messageId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: MESSAGE_POLL_VOTE_LOG.voteFailureMessage,
      metadata: { messageId, slug },
      responseMessage: MESSAGE_POLL_VOTE_RESPONSE.unexpectedMessage,
    },
    async ({ member, modules }) => {
      if (!isUuidRouteParam(messageId)) {
        return createRouteJsonResponse(
          { message: MESSAGE_POLL_VOTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      }

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const rawOptionIds = body?.[MESSAGE_POLL_VOTE_FIELD.optionIds];
      const optionIds = Array.isArray(rawOptionIds)
        ? rawOptionIds.filter(
            (optionId: unknown): optionId is string => typeof optionId === "string"
          )
        : [];
      const result = await modules.messages.useCases.submitMessagePollVote({
        messageId,
        optionIds,
        tribeSlug: slug,
        userId: member.id,
      });

      return createPostResultResponse(result, slug);
    }
  );
}
