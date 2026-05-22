import { TRIBE_WELCOME_SELECTION_STATUS } from "@/src/modules/tribes/constants/tribe-welcome";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const WELCOME_SELECTION_ROUTE_LOG = {
  feature: "tribes",
  operation: "record-tribe-welcome-selection",
  recordFailureMessage: "Tribe welcome selection record failed",
} as const;

const WELCOME_SELECTION_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés acceso a esta tribu.",
  invalidLinkMessage:
    "Ese botón ya no está disponible. Pedile al líder que lo revise.",
  invalidPayloadMessage: "Falta el botón que querías marcar.",
  recordedMessage: "Elección registrada.",
  unauthorizedMessage: "Iniciá sesión para registrar tu elección.",
  unexpectedMessage:
    "No pudimos registrar tu elección. Probá de nuevo en unos minutos.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createJsonResponse(
  body: Record<string, string>,
  status: number
): Response {
  return Response.json(body, { status });
}

function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readWelcomeLinkId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return UUID_PATTERN.test(trimmedValue) ? trimmedValue : null;
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: WELCOME_SELECTION_ROUTE_LOG.feature,
    operation: WELCOME_SELECTION_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: WELCOME_SELECTION_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  const parsedBody = await request.json().catch(() => null);

  if (!isPayloadObject(parsedBody)) {
    return createJsonResponse(
      { message: WELCOME_SELECTION_ROUTE_RESPONSE.invalidPayloadMessage },
      HTTP_STATUS.badRequest
    );
  }

  const welcomeLinkId = readWelcomeLinkId(parsedBody.welcomeLinkId);

  if (!welcomeLinkId) {
    return createJsonResponse(
      { message: WELCOME_SELECTION_ROUTE_RESPONSE.invalidPayloadMessage },
      HTTP_STATUS.badRequest
    );
  }

  try {
    const result = await modules.tribes.useCases.recordTribeWelcomeSelection({
      tribeSlug: slug,
      welcomeLinkId,
    });

    switch (result.status) {
      case TRIBE_WELCOME_SELECTION_STATUS.recorded:
        return createJsonResponse(
          { message: WELCOME_SELECTION_ROUTE_RESPONSE.recordedMessage },
          HTTP_STATUS.ok
        );
      case TRIBE_WELCOME_SELECTION_STATUS.invalidLink:
        return createJsonResponse(
          { message: WELCOME_SELECTION_ROUTE_RESPONSE.invalidLinkMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_WELCOME_SELECTION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: WELCOME_SELECTION_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      error,
      message: WELCOME_SELECTION_ROUTE_LOG.recordFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
        welcomeLinkId,
      },
    });

    return createJsonResponse(
      { message: WELCOME_SELECTION_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
