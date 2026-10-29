import type { z } from "zod";

import {
  notificationEmptyParamsSchema,
  notificationEmptyQuerySchema,
} from "@/src/modules/notifications/infrastructure/api/notification-request-schemas";
import {
  NOTIFICATION_ROUTE_HTTP_STATUS,
  NOTIFICATION_ROUTE_RESPONSE,
  createNotificationJsonResponse,
  createNotificationPublicResponse,
  parseNotificationRouteInput,
} from "@/src/modules/notifications/infrastructure/api/notification-route-http";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const NOTIFICATION_ROUTE_LOG_FEATURE = "notifications";

const NOTIFICATION_ROUTE_SESSION_LOG = {
  failureMessage: "Notification route session resolution failed",
} as const;

/**
 * Operation-specific wiring of a notification route: its log operation and
 * the safe Spanish copy it answers with on an unexpected failure.
 */
export type NotificationRouteSessionOptions = {
  operation: string;
  unexpectedFailureMessage: string;
};

/**
 * Composes the request modules and looks up the signed-in member; either
 * step may reject (pool, configuration, Better Auth).
 */
async function loadRequestSession(requestId: string) {
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  return { authenticatedMember, modules };
}

/**
 * Request logger, composed modules, and the signed-in member shared by the
 * notification routes. Without a session the route answers 401 and never
 * touches the inbox. A failure while composing the modules or looking up the
 * Better Auth session is logged here (with `requestId` and the route
 * operation) and becomes the same safe no-store 500 the route handlers use,
 * so it never escapes as an unclassified framework error.
 *
 * @param request - Incoming request (tracing headers).
 * @param options - Log operation and safe failure copy of the route.
 * @returns The resolved context or the response (401 or 500) to return as is.
 */
async function resolveNotificationRouteSession(
  request: Request,
  options: NotificationRouteSessionOptions
) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: NOTIFICATION_ROUTE_LOG_FEATURE,
    operation: options.operation,
    requestId,
  });
  let loadedSession: Awaited<ReturnType<typeof loadRequestSession>>;

  try {
    loadedSession = await loadRequestSession(requestId);
  } catch (error) {
    logger.error({ error, message: NOTIFICATION_ROUTE_SESSION_LOG.failureMessage });

    return {
      isResolved: false,
      response: createNotificationJsonResponse(
        { message: options.unexpectedFailureMessage },
        NOTIFICATION_ROUTE_HTTP_STATUS.serverError
      ),
    } as const;
  }

  const { authenticatedMember, modules } = loadedSession;

  if (!authenticatedMember) {
    return {
      isResolved: false,
      response: createNotificationJsonResponse(
        { message: NOTIFICATION_ROUTE_RESPONSE.unauthorizedMessage },
        NOTIFICATION_ROUTE_HTTP_STATUS.unauthorized
      ),
    } as const;
  }

  return {
    isResolved: true,
    logger,
    metadata: { userId: authenticatedMember.id },
    modules,
  } as const;
}

type ResolvedNotificationRouteSession = Extract<
  Awaited<ReturnType<typeof resolveNotificationRouteSession>>,
  { isResolved: true }
>;

/** Typed input, session and responder a notification route body receives. */
export type NotificationRouteBody<TParams, TBody> = {
  body: TBody;
  logger: ResolvedNotificationRouteSession["logger"];
  modules: ResolvedNotificationRouteSession["modules"];
  params: TParams;
  /** Validates a success body against its public DTO schema and answers it. */
  respond: <TDto>(body: unknown, schema: z.ZodType<TDto>) => Response;
};

/** Description of one notification route handler. */
export type NotificationRouteDefinition<TParams, TQuery, TBody> = {
  failureLogMessage: string;
  operation: string;
  /** Route ids logged after the user id. */
  readMetadata?: (params: TParams) => Record<string, unknown>;
  schemas: { body?: z.ZodType<TBody>; params: z.ZodType<TParams>; query: z.ZodType<TQuery> };
  /** Safe Spanish copy of the 500 (also the DTO fallback). */
  unexpectedFailureMessage: string;
};

/**
 * Runs one notification route handler: session (401/500), input validation
 * (400), the route body, and the logged no-store 500 when the body throws.
 *
 * @param request - Incoming request.
 * @param params - Raw route params.
 * @param route - Operation, schemas, log metadata and failure copy.
 * @param handle - Route body run with the typed input and session.
 * @returns The route response.
 */
export async function handleNotificationRoute<TParams, TQuery, TBody = undefined>(
  request: Request,
  params: Promise<unknown>,
  route: NotificationRouteDefinition<TParams, TQuery, TBody>,
  handle: (route: NotificationRouteBody<TParams, TBody>) => Promise<Response>
): Promise<Response> {
  const session = await resolveNotificationRouteSession(request, {
    operation: route.operation,
    unexpectedFailureMessage: route.unexpectedFailureMessage,
  });

  if (!session.isResolved) {
    return session.response;
  }

  const { logger, modules } = session;
  const input = await parseNotificationRouteInput({
    logger,
    params,
    request,
    schemas: route.schemas,
  });

  if (!input.isValid) {
    return input.response;
  }

  const metadata = route.readMetadata
    ? { ...session.metadata, ...route.readMetadata(input.params) }
    : session.metadata;

  try {
    return await handle({
      body: input.body,
      logger,
      modules,
      params: input.params,
      respond: (body, schema) =>
        createNotificationPublicResponse({
          body,
          failureMessage: route.unexpectedFailureMessage,
          logger,
          metadata,
          schema,
        }),
    });
  } catch (error) {
    logger.error({ error, message: route.failureLogMessage, metadata });

    return createNotificationJsonResponse(
      { message: route.unexpectedFailureMessage },
      NOTIFICATION_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * Runs a notification route without params, query or body (inbox, unread
 * count, mark all as read); see {@link handleNotificationRoute}.
 *
 * @param request - Incoming request.
 * @param route - Operation and failure copy.
 * @param handle - Route body run with the session.
 * @returns The route response.
 */
export function handleNotificationInboxRoute(
  request: Request,
  route: Pick<
    NotificationRouteDefinition<unknown, unknown, undefined>,
    "failureLogMessage" | "operation" | "unexpectedFailureMessage"
  >,
  handle: (route: NotificationRouteBody<unknown, undefined>) => Promise<Response>
): Promise<Response> {
  return handleNotificationRoute(
    request,
    Promise.resolve({}),
    {
      ...route,
      schemas: { params: notificationEmptyParamsSchema, query: notificationEmptyQuerySchema },
    },
    handle
  );
}
