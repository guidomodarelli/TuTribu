/**
 * Scheduled maintenance endpoint of the in-app notifications: enqueues the
 * event reminders that are due (24 h and 15 min before each occurrence) and
 * purges old read notifications.
 *
 * It is invoked every 5 minutes by the Vercel Cron in `vercel.json` and by the
 * Cloudflare Worker `scheduled` handler (`wrangler.jsonc`), guarded by the
 * shared `CRON_SECRET` bearer token, and composed with the maintenance
 * connection because it reads the events of every tribe without an app user.
 *
 * @module event-reminders-route
 */

import { createMaintenanceModules } from "@/src/modules/setup";
import { isAuthorizedCronRequest } from "@/src/modules/shared/infrastructure/http/cron-authorization";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const EVENT_REMINDERS_ROUTE_LOG = {
  feature: "notifications",
  operation: "event-reminders-cron",
  purgeOperationKey: "purge-read-notifications",
  remindersOperationKey: "send-tribe-event-reminders",
  stepCompletedMessage: "Notification maintenance step completed",
  stepFailedMessage: "Notification maintenance step failed",
} as const;

const STEP_RESULT = {
  completed: "completed",
  failed: "failed",
} as const;

const EVENT_REMINDERS_ROUTE_RESPONSE = {
  ok: "ok",
  partialFailure: "error",
  unauthorized: "unauthorized",
} as const;

const HTTP_STATUS = {
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

type ServerLogger = ReturnType<typeof createServerLogger>;

/**
 * Runs one maintenance step, logging its outcome with a stable
 * `operation_key` and its counters. A failure is logged and reported as
 * `null` so the other step still runs.
 */
async function runLoggedStep<TSummary extends object>(
  logger: ServerLogger,
  operationKey: string,
  step: () => Promise<TSummary>
): Promise<TSummary | null> {
  try {
    const summary = await step();

    logger.info({
      message: EVENT_REMINDERS_ROUTE_LOG.stepCompletedMessage,
      metadata: { ...summary, operation_key: operationKey, result: STEP_RESULT.completed },
    });

    return summary;
  } catch (error) {
    logger.error({
      error,
      message: EVENT_REMINDERS_ROUTE_LOG.stepFailedMessage,
      metadata: { operation_key: operationKey, result: STEP_RESULT.failed },
    });

    return null;
  }
}

/**
 * Runs the reminder job and the retention purge once.
 *
 * @param request - Cron request with the bearer token and tracing headers.
 * @returns JSON with the counters of each step, or a safe failure status.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json(
      { status: EVENT_REMINDERS_ROUTE_RESPONSE.unauthorized },
      { status: HTTP_STATUS.unauthorized }
    );
  }

  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: EVENT_REMINDERS_ROUTE_LOG.feature,
    operation: EVENT_REMINDERS_ROUTE_LOG.operation,
    requestId,
  });
  let modules: Awaited<ReturnType<typeof createMaintenanceModules>>;

  try {
    modules = await createMaintenanceModules({ requestId });
  } catch (error) {
    logger.error({
      error,
      message: EVENT_REMINDERS_ROUTE_LOG.stepFailedMessage,
      metadata: {
        operation_key: EVENT_REMINDERS_ROUTE_LOG.operation,
        result: STEP_RESULT.failed,
      },
    });

    return Response.json(
      { status: EVENT_REMINDERS_ROUTE_RESPONSE.partialFailure },
      { status: HTTP_STATUS.serverError }
    );
  }

  const reminders = await runLoggedStep(logger, EVENT_REMINDERS_ROUTE_LOG.remindersOperationKey, () =>
    modules.events.useCases.sendTribeEventReminders()
  );
  const purge = await runLoggedStep(logger, EVENT_REMINDERS_ROUTE_LOG.purgeOperationKey, () =>
    modules.notifications.useCases.purgeReadNotifications()
  );
  const isOk = reminders !== null && purge !== null;

  return Response.json(
    {
      purge,
      reminders,
      status: isOk
        ? EVENT_REMINDERS_ROUTE_RESPONSE.ok
        : EVENT_REMINDERS_ROUTE_RESPONSE.partialFailure,
    },
    { status: isOk ? HTTP_STATUS.ok : HTTP_STATUS.serverError }
  );
}
