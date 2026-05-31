import {
  attachRequestContextToResponse,
  resolveRequestContext,
  type RequestContext,
} from "./request-context";
import {
  createServerLogger,
  type ServerLogLevel,
} from "./server-logger";

type RouteObservationInput = {
  feature: string;
  operation: string;
  request: Request;
};

type RouteOutcomeLogInput = {
  level?: ServerLogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  outcome: string;
  status: number;
};

type RouteErrorLogInput = RouteOutcomeLogInput & {
  error: unknown;
};

type RouteResponseLogInput = Omit<RouteOutcomeLogInput, "status">;

type RouteObservation = {
  createJsonResponse: (
    body: Record<string, unknown>,
    status: number,
    logInput?: RouteResponseLogInput
  ) => Response;
  createRedirectResponse: (
    url: URL | string,
    status?: number,
    logInput?: RouteResponseLogInput
  ) => Response;
  logRouteError: (input: RouteErrorLogInput) => void;
  logRouteOutcome: (input: RouteOutcomeLogInput) => void;
  logger: ReturnType<typeof createServerLogger>;
  requestContext: RequestContext;
  requestId: string;
  startedAt: number;
  traceId: string;
};

const ROUTE_OBSERVATION_DEFAULT = {
  redirectStatus: 302,
} as const;

/**
 * Builds request-scoped observability helpers for route handlers.
 *
 * @param input - Route request, feature, and operation metadata.
 * @returns Logger, correlation context, and response helpers for the route.
 */
export function createRouteObservation(
  input: RouteObservationInput
): RouteObservation {
  const requestContext = resolveRequestContext(input.request.headers);
  const startedAt = Date.now();
  const logger = createServerLogger({
    feature: input.feature,
    operation: input.operation,
    requestId: requestContext.requestId,
    traceId: requestContext.traceId,
  });
  const buildMetadata = (
    status: number,
    outcome: string,
    metadata?: Record<string, unknown>
  ): Record<string, unknown> => ({
    ...metadata,
    durationMs: Date.now() - startedAt,
    outcome,
    status,
  });
  const logRouteOutcome = (logInput: RouteOutcomeLogInput): void => {
    const level = logInput.level ?? "info";

    logger[level]({
      message: logInput.message,
      metadata: buildMetadata(
        logInput.status,
        logInput.outcome,
        logInput.metadata
      ),
    });
  };
  const logRouteError = (logInput: RouteErrorLogInput): void => {
    logger.error({
      error: logInput.error,
      message: logInput.message,
      metadata: buildMetadata(
        logInput.status,
        logInput.outcome,
        logInput.metadata
      ),
    });
  };

  return {
    createJsonResponse(
      body: Record<string, unknown>,
      status: number,
      logInput?: RouteResponseLogInput
    ) {
      if (logInput) {
        logRouteOutcome({
          ...logInput,
          status,
        });
      }

      return attachRequestContextToResponse(
        Response.json(body, { status }),
        requestContext
      );
    },
    createRedirectResponse(
      url: URL | string,
      status = ROUTE_OBSERVATION_DEFAULT.redirectStatus,
      logInput?: RouteResponseLogInput
    ) {
      if (logInput) {
        logRouteOutcome({
          ...logInput,
          status,
        });
      }

      return attachRequestContextToResponse(Response.redirect(url, status), requestContext);
    },
    logRouteError,
    logRouteOutcome,
    logger,
    requestContext,
    requestId: requestContext.requestId,
    startedAt,
    traceId: requestContext.traceId,
  };
}
