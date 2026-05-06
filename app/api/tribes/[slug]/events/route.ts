import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const EVENT_ROUTE_FIELD = {
  description: "description",
  endsAt: "endsAt",
  meetingUrl: "meetingUrl",
  startsAt: "startsAt",
  title: "title",
} as const;
const EVENT_ROUTE_QUERY_PARAM = {
  month: "month",
} as const;

const EVENT_ROUTE_LOG = {
  createFailureMessage: "Tribe event creation failed",
  feature: "events",
  listFailureMessage: "Tribe event listing failed",
  operation: "manage-tribe-events",
} as const;

const EVENT_ROUTE_RESPONSE = {
  createSuccessMessage: "Evento creado.",
  forbiddenMessage: "No tenés permisos para gestionar eventos.",
  invalidDateMessage: "La fecha de fin debe ser posterior al inicio.",
  invalidInputMessage: "Completá el título y la fecha de inicio del evento.",
  invalidMeetingUrlMessage: "Usá un link digital válido que empiece con http o https.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Iniciá sesión para gestionar eventos.",
  unexpectedCreateMessage: "No pudimos guardar el evento. Intentá de nuevo.",
  unexpectedListMessage: "No pudimos cargar los eventos. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function readStringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || !(field in body)) {
    return "";
  }

  const value = (body as Record<string, unknown>)[field];

  return typeof value === "string" ? value : "";
}

function mapMutationStatusResponse(status: string) {
  switch (status) {
    case TRIBE_EVENT_MUTATION_STATUS.invalidInput:
      return createJsonResponse(
        { message: EVENT_ROUTE_RESPONSE.invalidInputMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.invalidDate:
      return createJsonResponse(
        { message: EVENT_ROUTE_RESPONSE.invalidDateMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl:
      return createJsonResponse(
        { message: EVENT_ROUTE_RESPONSE.invalidMeetingUrlMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: EVENT_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case TRIBE_EVENT_MUTATION_STATUS.forbidden:
    default:
      return createJsonResponse(
        { message: EVENT_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function GET(
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
    feature: EVENT_ROUTE_LOG.feature,
    operation: EVENT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: EVENT_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const result = await modules.events.useCases.listTribeEvents({
      month: searchParams.get(EVENT_ROUTE_QUERY_PARAM.month) ?? undefined,
      tribeSlug: slug,
    });

    return createJsonResponse(result, HTTP_STATUS.ok);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.listFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: EVENT_ROUTE_RESPONSE.unexpectedListMessage },
      HTTP_STATUS.serverError
    );
  }
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
    feature: EVENT_ROUTE_LOG.feature,
    operation: EVENT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: EVENT_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.events.useCases.createTribeEvent({
      description: readStringField(body, EVENT_ROUTE_FIELD.description),
      endsAt: readStringField(body, EVENT_ROUTE_FIELD.endsAt),
      meetingUrl: readStringField(body, EVENT_ROUTE_FIELD.meetingUrl),
      startsAt: readStringField(body, EVENT_ROUTE_FIELD.startsAt),
      title: readStringField(body, EVENT_ROUTE_FIELD.title),
      tribeSlug: slug,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.created) {
      return createJsonResponse(
        {
          event: result.event,
          message: EVENT_ROUTE_RESPONSE.createSuccessMessage,
        },
        HTTP_STATUS.created
      );
    }

    return mapMutationStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: EVENT_ROUTE_RESPONSE.unexpectedCreateMessage },
      HTTP_STATUS.serverError
    );
  }
}
