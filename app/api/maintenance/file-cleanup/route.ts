/**
 * Scheduled maintenance endpoint that sweeps orphaned R2 attachment objects
 * (fogon message files and course lesson files).
 *
 * It is invoked by the Vercel Cron defined in `vercel.json` (and re-entered by
 * the Cloudflare Worker `scheduled` handler) and is guarded by a shared
 * `CRON_SECRET` bearer token, so it never runs on behalf of an end user.
 *
 * @module orphan-file-cleanup-route
 */

import { createMaintenanceModules } from "@/src/modules/setup";
import { isAuthorizedCronRequest } from "@/src/modules/shared/infrastructure/http/cron-authorization";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const FILE_CLEANUP_ROUTE_LOG = {
  completedMessage: "Orphan file cleanup sweep completed",
  failureMessage: "Orphan file cleanup sweep failed",
  feature: "attachments",
  operation: "cleanup-orphan-attachment-files",
} as const;

const FILE_CLEANUP_ROUTE_RESPONSE = {
  ok: "ok",
  unauthorized: "unauthorized",
  unexpected: "error",
} as const;

const HTTP_STATUS = {
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
}

/**
 * Runs one orphan-file cleanup sweep on a cron schedule: message attachments
 * (which also drain the shared CASCADE queue) and lesson attachments.
 *
 * @param request - HTTP request carrying the cron bearer token and tracing headers.
 * @returns JSON response with the sweep counters or a safe failure status.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return createJsonResponse(
      { status: FILE_CLEANUP_ROUTE_RESPONSE.unauthorized },
      HTTP_STATUS.unauthorized
    );
  }

  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: FILE_CLEANUP_ROUTE_LOG.feature,
    operation: FILE_CLEANUP_ROUTE_LOG.operation,
    requestId,
  });

  try {
    const modules = await createMaintenanceModules({ requestId });
    const messageFilesSummary =
      await modules.messages.useCases.cleanupOrphanMessageFiles();
    const lessonFilesSummary =
      await modules.courses.useCases.cleanupOrphanLessonFiles();

    logger.info({
      message: FILE_CLEANUP_ROUTE_LOG.completedMessage,
      metadata: { lessonFiles: lessonFilesSummary, messageFiles: messageFilesSummary },
    });

    return createJsonResponse(
      {
        lessonFiles: lessonFilesSummary,
        messageFiles: messageFilesSummary,
        status: FILE_CLEANUP_ROUTE_RESPONSE.ok,
      },
      HTTP_STATUS.ok
    );
  } catch (error) {
    logger.error({
      message: FILE_CLEANUP_ROUTE_LOG.failureMessage,
      error,
    });

    return createJsonResponse(
      { status: FILE_CLEANUP_ROUTE_RESPONSE.unexpected },
      HTTP_STATUS.serverError
    );
  }
}
