/**
 * Shared flow of the tribe event route handlers: open the request scope,
 * validate params, query and body once, build the safe log metadata, run the
 * route body, and turn a thrown error into the logged, safe 500. Routes only
 * describe their schemas, copy and use case call.
 *
 * @module tribe-event-route
 */

import type { z } from "zod";

import {
  openMemberRouteScope,
  type AuthenticatedMember,
  type RequestModules,
  type RouteLogger,
} from "@/app/api/member-route-scope";
import { openTribeEventPostEventRouteScope } from "@/app/api/tribes/[slug]/events/post-event-route-scope";
import { readAttendanceStreakResponseFragment } from "@/src/modules/events/infrastructure/api/tribe-event-attendance-streak-response";
import { createTribeEventPublicResponse } from "@/src/modules/events/infrastructure/api/tribe-event-public-response";
import {
  parseTribeEventRouteInput,
  type TribeEventRouteInput,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-input";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";

const TRIBE_EVENT_ROUTE_FEATURE = "events";

const FILE_RESPONSE_HEADER = {
  cacheControl: "Cache-Control",
  contentDisposition: "Content-Disposition",
  contentType: "Content-Type",
} as const;

const FILE_RESPONSE_HEADER_VALUE = {
  attachmentPrefix: 'attachment; filename="',
  attachmentSuffix: '"',
  noStore: "private, no-store",
} as const;

/** Route context of the handlers under `/api/tribes/[slug]/events`. */
export type TribeEventsRouteContext = { params: Promise<{ slug: string }> };

/** Route context of the handlers under `/api/tribes/[slug]/events/[eventId]`. */
export type TribeEventRouteContext = {
  params: Promise<{ eventId: string; slug: string }>;
};

/** Open request scope of an event route, or the response to return as is. */
export type TribeEventRouteScopeResult =
  | {
      isOpen: true;
      logger: RouteLogger;
      member: AuthenticatedMember;
      modules: RequestModules;
    }
  | { isOpen: false; response: Response };

type ValidTribeEventRouteInput<TParams, TQuery, TBody> = Extract<
  TribeEventRouteInput<TParams, TQuery, TBody>,
  { isValid: true }
>;

/** What an event route body receives: typed input, scope and responders. */
export type TribeEventRouteBody<TParams, TQuery, TBody> = {
  body: TBody;
  logger: RouteLogger;
  logMetadata: Record<string, unknown>;
  member: AuthenticatedMember;
  modules: RequestModules;
  params: TParams;
  query: TQuery;
  /**
   * Validates a success body against its public DTO schema and answers it;
   * an unusable DTO becomes the route's safe 500, logged with the route
   * metadata plus the optional extra fields.
   */
  respond: <TDto>(
    body: unknown,
    schema: z.ZodType<TDto>,
    status: number,
    extraMetadata?: Record<string, unknown>
  ) => Response;
};

/** Description of one event route handler. */
export type TribeEventRouteDefinition<TParams, TQuery, TBody> = {
  failure: {
    /** Extra fields logged only with an unexpected failure. */
    extraMetadata?: Record<string, unknown>;
    logMessage: string;
    /** Safe Spanish copy of the 500 (also the DTO fallback). */
    responseMessage: string;
  };
  openScope: (request: Request) => Promise<TribeEventRouteScopeResult>;
  /**
   * Safe log metadata of the route (the tribe slug when omitted); the viewer
   * id is appended.
   */
  readLogMetadata?: (
    input: ValidTribeEventRouteInput<TParams, TQuery, TBody>
  ) => Record<string, unknown>;
  schemas: {
    body?: z.ZodType<TBody>;
    params: z.ZodType<TParams>;
    query: z.ZodType<TQuery>;
  };
};

/**
 * Scope opener of the event route handlers: request-scoped logger and
 * modules (correlated with the request id) and the session check.
 *
 * @param operation - Log operation of the route.
 * @returns The scope opener.
 */
export function openTribeEventScope(
  operation: string
): (request: Request) => Promise<TribeEventRouteScopeResult> {
  return (request) =>
    openMemberRouteScope(request, {
      feature: TRIBE_EVENT_ROUTE_FEATURE,
      operation,
      unauthorizedMessage: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage,
      withRequestId: true,
    });
}

/**
 * Scope opener of the post-event route handlers, which also answer a failure
 * while composing the modules or reading the session with their safe 500.
 *
 * @param operation - Log operation of the route.
 * @param unexpectedFailureMessage - Safe Spanish copy of that 500.
 * @returns The scope opener.
 */
export function openTribeEventPostEventScope(
  operation: string,
  unexpectedFailureMessage: string
): (request: Request) => Promise<TribeEventRouteScopeResult> {
  return (request) =>
    openTribeEventPostEventRouteScope(request, { operation, unexpectedFailureMessage });
}

/**
 * Runs one event route handler: scope (401/500 as the opener decides), input
 * validation (400), the route body, and the logged 500 when the body throws.
 *
 * @param request - Incoming request.
 * @param context - Route context with the raw params.
 * @param route - Scope opener, schemas, log metadata and failure copy.
 * @param handle - Route body run with the typed input and scope.
 * @returns The route response.
 */
export async function handleTribeEventRoute<
  TParams extends { slug: string },
  TQuery,
  TBody = undefined,
>(
  request: Request,
  context: { params: Promise<unknown> },
  route: TribeEventRouteDefinition<TParams, TQuery, TBody>,
  handle: (route: TribeEventRouteBody<TParams, TQuery, TBody>) => Promise<Response>
): Promise<Response> {
  const scope = await route.openScope(request);

  if (!scope.isOpen) {
    return scope.response;
  }

  const { logger, member, modules } = scope;
  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: route.schemas,
  });

  if (!input.isValid) {
    return input.response;
  }

  const routeMetadata = route.readLogMetadata
    ? route.readLogMetadata(input)
    : { slug: input.params.slug };
  const logMetadata = { ...routeMetadata, viewerId: member.id };

  try {
    return await handle({
      body: input.body,
      logger,
      logMetadata,
      member,
      modules,
      params: input.params,
      query: input.query,
      respond: (body, schema, status, extraMetadata) =>
        createTribeEventPublicResponse({
          body,
          failureMessage: route.failure.responseMessage,
          logger,
          metadata: extraMetadata ? { ...logMetadata, ...extraMetadata } : logMetadata,
          schema,
          status,
        }),
    });
  } catch (error) {
    logger.error({
      message: route.failure.logMessage,
      error,
      metadata: { ...logMetadata, ...route.failure.extraMetadata },
    });

    return createJsonResponse(
      { message: route.failure.responseMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * Log metadata of a route about one occurrence picked by the `occurrence`
 * query param, under the given key.
 *
 * @param key - Metadata key of the occurrence start.
 * @returns The metadata reader.
 */
export function readEventOccurrenceLogMetadata(key: "occurrenceStartsAt" | "originalStartsAt") {
  return (input: {
    params: { eventId: string; slug: string };
    query: { occurrence: string };
  }): Record<string, unknown> => ({
    eventId: input.params.eventId,
    [key]: input.query.occurrence,
    slug: input.params.slug,
  });
}

/**
 * Reads the viewer's recomputed attendance streak after a change to an event
 * that can move their last finished occurrences.
 *
 * @param route - Event route context (modules, logger and viewer).
 * @param target - Event id and tribe slug.
 * @returns The streak fragment to spread into the success body.
 */
export function readViewerAttendanceStreakFragment(
  route: Pick<TribeEventRouteBody<unknown, unknown, unknown>, "logger" | "member" | "modules">,
  target: { eventId: string; tribeSlug: string }
) {
  return readAttendanceStreakResponseFragment({
    eventId: target.eventId,
    getTribeEventAttendanceStreakSnapshot:
      route.modules.events.useCases.getTribeEventAttendanceStreakSnapshot,
    logger: route.logger,
    tribeSlug: target.tribeSlug,
    viewerId: route.member.id,
  });
}

/**
 * Answers a private file download (`.ics`, `.csv`) that must not be cached.
 *
 * @param file - File content, MIME type and download name.
 * @returns The 200 attachment response.
 */
export function createPrivateFileDownloadResponse(file: {
  content: string;
  contentType: string;
  fileName: string;
}): Response {
  return new Response(file.content, {
    headers: {
      [FILE_RESPONSE_HEADER.cacheControl]: FILE_RESPONSE_HEADER_VALUE.noStore,
      [FILE_RESPONSE_HEADER.contentDisposition]:
        FILE_RESPONSE_HEADER_VALUE.attachmentPrefix +
        file.fileName +
        FILE_RESPONSE_HEADER_VALUE.attachmentSuffix,
      [FILE_RESPONSE_HEADER.contentType]: file.contentType,
    },
    status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
  });
}
