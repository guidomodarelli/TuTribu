/**
 * Shared wiring of the member-only route handlers: request-scoped logger and
 * modules, the session check, and the safe 500 for unexpected failures. It
 * lives in the app layer because it composes the request modules
 * (composition root); module code never imports `@/src/modules/setup`.
 *
 * @module member-route-scope
 */

import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const MEMBER_ROUTE_HTTP_STATUS = {
  serverError: 500,
  unauthorized: 401,
} as const;

export type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;

export type AuthenticatedMember = NonNullable<
  Awaited<ReturnType<RequestModules["auth"]["useCases"]["getAuthenticatedMember"]>>
>;

export type RouteLogger = ReturnType<typeof createServerLogger>;

/**
 * Route-specific wiring: the log feature and operation, the copy of the 401
 * answered without a session, and whether the modules carry the request id.
 */
export type MemberRouteScopeOptions = {
  feature: string;
  operation: string;
  unauthorizedMessage: string;
  withRequestId?: boolean;
};

export type MemberRouteScope =
  | {
      isOpen: true;
      logger: RouteLogger;
      member: AuthenticatedMember;
      modules: RequestModules;
      requestId: string;
    }
  | { isOpen: false; response: Response };

/**
 * Builds a JSON response with the given body and status.
 *
 * @param body - Response payload.
 * @param status - HTTP status code.
 * @returns The JSON response.
 */
export function createRouteJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
}

/**
 * Builds a JSON response whose body only carries a user-facing message.
 *
 * @param message - Spanish copy for the user.
 * @param status - HTTP status code.
 * @returns The JSON response.
 */
function createRouteMessageResponse(message: string, status: number): Response {
  return createRouteJsonResponse({ message }, status);
}

function createMemberRouteLogger(request: Request, options: MemberRouteScopeOptions) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: options.feature,
    operation: options.operation,
    requestId,
  });

  return { logger, requestId };
}

/**
 * Composes the request modules (correlated with the request id when the
 * route asks for it) and looks up the signed-in member.
 */
async function loadMemberRouteSession(options: MemberRouteScopeOptions, requestId: string) {
  const modules = options.withRequestId
    ? await createRequestModules({ requestId })
    : await createRequestModules();
  const member = await modules.auth.useCases.getAuthenticatedMember();

  return { member, modules };
}

function createUnauthorizedResponse(options: MemberRouteScopeOptions): Response {
  return createRouteMessageResponse(
    options.unauthorizedMessage,
    MEMBER_ROUTE_HTTP_STATUS.unauthorized
  );
}

/**
 * Opens the request scope of a member-only route: resolves the correlation
 * id, creates the logger, composes the request modules and looks up the
 * signed-in member (401 with the route copy when there is none).
 *
 * @param request - Incoming request (carries the correlation id).
 * @param options - Log wiring and unauthorized copy of the route.
 * @returns The open scope, or the 401 response to return as is.
 */
export async function openMemberRouteScope(
  request: Request,
  options: MemberRouteScopeOptions
): Promise<MemberRouteScope> {
  const { logger, requestId } = createMemberRouteLogger(request, options);
  const { member, modules } = await loadMemberRouteSession(options, requestId);

  if (!member) {
    return { isOpen: false, response: createUnauthorizedResponse(options) };
  }

  return { isOpen: true, logger, member, modules, requestId };
}

/**
 * How a route reports an unexpected failure: the logger, the log message and
 * metadata, and the safe Spanish copy of the 500 answer.
 */
export type UnexpectedRouteFailure = {
  logger: RouteLogger;
  logMessage: string;
  metadata?: Record<string, unknown>;
  responseMessage: string;
};

/**
 * Logs an unexpected route failure and builds the safe 500 answer.
 *
 * @param failure - Logger, log message, metadata and response copy.
 * @param error - Caught error.
 * @returns The 500 response.
 */
function respondToUnexpectedRouteFailure(
  failure: UnexpectedRouteFailure,
  error: unknown
): Response {
  failure.logger.error({
    message: failure.logMessage,
    error,
    ...(failure.metadata ? { metadata: failure.metadata } : {}),
  });

  return createRouteMessageResponse(
    failure.responseMessage,
    MEMBER_ROUTE_HTTP_STATUS.serverError
  );
}

/**
 * Runs the body of a route handler and turns any thrown error into the
 * logged, safe 500 answer of the route.
 *
 * @param failure - Logger, log message, metadata and response copy.
 * @param handle - Route body producing the response.
 * @returns The handler response, or the 500 response when it throws.
 */
async function runMemberRoute(
  failure: UnexpectedRouteFailure,
  handle: () => Promise<Response>
): Promise<Response> {
  try {
    return await handle();
  } catch (error) {
    return respondToUnexpectedRouteFailure(failure, error);
  }
}

export type OpenMemberRouteScope = Extract<MemberRouteScope, { isOpen: true }>;

/**
 * Failure copy of a member route whose log metadata ends with the viewer id:
 * the log message, the route metadata (the helper appends `viewerId`) and
 * the safe 500 copy.
 */
export type MemberRouteFailureCopy = {
  logMessage: string;
  metadata: Record<string, unknown>;
  responseMessage: string;
};

/**
 * Opens the member scope of a route and runs its body; without a session it
 * answers the 401, and a thrown error is logged with the route metadata plus
 * the viewer id and answered with the safe 500.
 *
 * @param request - Incoming request.
 * @param scopeOptions - Log wiring and unauthorized copy of the route.
 * @param failure - Failure copy and log metadata of the route.
 * @param handle - Route body run with the open scope.
 * @returns The route response.
 */
export async function handleMemberRoute(
  request: Request,
  scopeOptions: MemberRouteScopeOptions,
  failure: MemberRouteFailureCopy,
  handle: (scope: OpenMemberRouteScope) => Promise<Response>
): Promise<Response> {
  const scope = await openMemberRouteScope(request, scopeOptions);

  if (!scope.isOpen) {
    return scope.response;
  }

  return runMemberRoute(
    {
      logger: scope.logger,
      logMessage: failure.logMessage,
      metadata: { ...failure.metadata, viewerId: scope.member.id },
      responseMessage: failure.responseMessage,
    },
    () => handle(scope)
  );
}

/**
 * Log and response copy of a member route whose wiring comes from one log
 * entry (feature, operation and failure message) and one response entry
 * (401 and 500 copy).
 */
export type MemberRouteCopy = {
  log: { failureMessage: string; feature: string; operation: string };
  response: { unauthorizedMessage: string; unexpectedMessage: string };
  withRequestId?: boolean;
};

/**
 * Runs a member route wired from its log and response copy: the log feature
 * and operation, the 401 copy, the failure log message and the safe 500 copy.
 *
 * @param request - Incoming request.
 * @param copy - Log and response copy of the route.
 * @param metadata - Log metadata of the route (the viewer id is appended).
 * @param handle - Route body run with the open scope.
 * @returns The route response.
 */
export function handleMemberRouteWithCopy(
  request: Request,
  copy: MemberRouteCopy,
  metadata: Record<string, unknown>,
  handle: (scope: OpenMemberRouteScope) => Promise<Response>
): Promise<Response> {
  return handleMemberRoute(
    request,
    {
      feature: copy.log.feature,
      operation: copy.log.operation,
      unauthorizedMessage: copy.response.unauthorizedMessage,
      ...(copy.withRequestId ? { withRequestId: true } : {}),
    },
    {
      logMessage: copy.log.failureMessage,
      metadata,
      responseMessage: copy.response.unexpectedMessage,
    },
    handle
  );
}

/** Copy and HTTP status answered for one use case status. */
export type StatusMessage = { message: string; status: number };

/**
 * Answers a use case status with the message response mapped to it, or with
 * the fallback when the status has no entry.
 *
 * @param status - Use case status.
 * @param responses - Message response per status.
 * @param fallback - Message response for any other status.
 * @returns The JSON response.
 */
export function createStatusMessageResponse(
  status: string,
  responses: Partial<Record<string, StatusMessage>>,
  fallback: StatusMessage
): Response {
  const response = responses[status] ?? fallback;

  return createRouteMessageResponse(response.message, response.status);
}

/**
 * Route context of the handlers under `/api/tribes/[slug]`, with the extra
 * dynamic segments of the route.
 */
export type TribeRouteContext<TParams extends Record<string, string> = { slug: string }> = {
  params: Promise<TParams & { slug: string }>;
};

/**
 * Failure copy of a guarded member route: the log message, the safe 500 copy
 * and the log metadata, read when the failure happens (the viewer id is
 * `null` when the session lookup itself failed).
 */
export type GuardedMemberRouteFailure = {
  logMessage: string;
  readMetadata: (viewerId: string | null) => Record<string, unknown>;
  responseMessage: string;
};

/**
 * Runs a member route whose module composition and session lookup are also
 * guarded: any failure from composing the modules on (session lookup or
 * route body) is logged and answered with the safe 500; without a session it
 * answers the 401.
 *
 * @param request - Incoming request.
 * @param scopeOptions - Log wiring and unauthorized copy of the route.
 * @param failure - Failure copy and log metadata of the route.
 * @param handle - Route body run with the open scope.
 * @returns The route response.
 */
export async function handleGuardedMemberRoute(
  request: Request,
  scopeOptions: MemberRouteScopeOptions,
  failure: GuardedMemberRouteFailure,
  handle: (scope: OpenMemberRouteScope) => Promise<Response>
): Promise<Response> {
  const { logger, requestId } = createMemberRouteLogger(request, scopeOptions);
  let viewerId: string | null = null;

  try {
    const { member, modules } = await loadMemberRouteSession(scopeOptions, requestId);

    if (!member) {
      return createUnauthorizedResponse(scopeOptions);
    }

    viewerId = member.id;

    return await handle({ isOpen: true, logger, member, modules, requestId });
  } catch (error) {
    return respondToUnexpectedRouteFailure(
      {
        logger,
        logMessage: failure.logMessage,
        metadata: failure.readMetadata(viewerId),
        responseMessage: failure.responseMessage,
      },
      error
    );
  }
}
