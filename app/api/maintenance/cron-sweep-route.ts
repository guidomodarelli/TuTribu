/**
 * Shared flow of the scheduled orphan cleanup endpoints: the `CRON_SECRET`
 * bearer check, the request-scoped logger and maintenance modules, the
 * completion log, and the safe failure answer.
 *
 * @module cron-sweep-route
 */

import { createMaintenanceModules } from "@/src/modules/setup";
import { isAuthorizedCronRequest } from "@/src/modules/shared/infrastructure/http/cron-authorization";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { HTTP_STATUS } from "@/app/api/route-http-status";

/** `status` values of the cleanup endpoint bodies. */
export const CRON_SWEEP_RESPONSE_STATUS = {
  ok: "ok",
  unauthorized: "unauthorized",
  unexpected: "error",
} as const;

type MaintenanceModules = Awaited<ReturnType<typeof createMaintenanceModules>>;

/** Log wiring of one cleanup endpoint. */
export type CronSweepRouteLog = {
  completedMessage: string;
  failureMessage: string;
  feature: string;
  operation: string;
};

/** Outcome of one sweep: the response body and the completion log metadata. */
export type CronSweepOutcome = {
  body: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

/**
 * Runs one cleanup sweep on a cron schedule: 401 without the cron bearer
 * token, the sweep counters (200) logged on completion, or a safe 500.
 *
 * @param request - HTTP request carrying the cron bearer token and tracing headers.
 * @param log - Log wiring of the endpoint.
 * @param sweep - Sweep run with the maintenance modules.
 * @returns JSON response with the sweep counters or a safe failure status.
 */
export async function handleCronSweepRoute(
  request: Request,
  log: CronSweepRouteLog,
  sweep: (modules: MaintenanceModules) => Promise<CronSweepOutcome>
): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json(
      { status: CRON_SWEEP_RESPONSE_STATUS.unauthorized },
      { status: HTTP_STATUS.unauthorized }
    );
  }

  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: log.feature,
    operation: log.operation,
    requestId,
  });

  try {
    const modules = await createMaintenanceModules({ requestId });
    const outcome = await sweep(modules);

    logger.info({ message: log.completedMessage, metadata: outcome.metadata });

    return Response.json(outcome.body, { status: HTTP_STATUS.ok });
  } catch (error) {
    logger.error({ message: log.failureMessage, error });

    return Response.json(
      { status: CRON_SWEEP_RESPONSE_STATUS.unexpected },
      { status: HTTP_STATUS.serverError }
    );
  }
}
