import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createRequestModules } from "@/src/modules/setup";

const MESSAGE_POLL_VOTE_FIELD = {
  optionIds: "optionIds",
} as const;

const MESSAGE_POLL_VOTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para votar esta encuesta.",
  invalidPollMessage: "Elegí al menos una opción para votar.",
  notFoundMessage: "No pudimos encontrar la encuesta.",
  successMessage: "Voto registrado.",
  unauthorizedMessage: "Inicia sesion para votar.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      messageId: string;
      slug: string;
    }>;
  }
) {
  const { messageId, slug } = await context.params;
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: MESSAGE_POLL_VOTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
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
    userId: authenticatedMember.id,
  });

  switch (result.status) {
    case MESSAGE_MUTATION_STATUS.voted:
      revalidateTribeRoundCache(slug);

      return createJsonResponse(
        {
          message: MESSAGE_POLL_VOTE_RESPONSE.successMessage,
          poll: result.poll,
        },
        HTTP_STATUS.ok
      );
    case MESSAGE_MUTATION_STATUS.invalidPoll:
      return createJsonResponse(
        { message: MESSAGE_POLL_VOTE_RESPONSE.invalidPollMessage },
        HTTP_STATUS.badRequest
      );
    case MESSAGE_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: MESSAGE_POLL_VOTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case MESSAGE_MUTATION_STATUS.forbidden:
    default:
      return createJsonResponse(
        { message: MESSAGE_POLL_VOTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}
