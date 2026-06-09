/**
 * Scheduled maintenance endpoint that sweeps orphaned Cloudflare image assets.
 *
 * It is invoked by the Vercel Cron defined in `vercel.json` and is guarded by a
 * shared `CRON_SECRET` bearer token, so it never runs on behalf of an end user.
 *
 * @module orphan-image-cleanup-route
 */

import { timingSafeEqual } from "node:crypto";

import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const IMAGE_CLEANUP_ROUTE_LOG = {
  completedMessage: "Orphan image cleanup sweep completed",
  failureMessage: "Orphan image cleanup sweep failed",
  feature: "messages",
  operation: "cleanup-orphan-message-images",
} as const;

const IMAGE_CLEANUP_ROUTE_RESPONSE = {
  ok: "ok",
  unauthorized: "unauthorized",
  unexpected: "error",
} as const;

const CRON_AUTHORIZATION_SCHEME = "Bearer";

const HTTP_STATUS = {
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

/**
 * Creates a JSON response with an explicit status.
 *
 * @param body - JSON body.
 * @param status - HTTP status.
 * @returns JSON response.
 */
function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
}

/**
 * Verifies the request carries the shared cron bearer token in constant time.
 *
 * @param request - Incoming cron request.
 * @returns Whether the request is an authorized cron invocation.
 */
function isAuthorizedCronRequest(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return false;
  }

  const providedHeader = request.headers.get("authorization");

  if (!providedHeader) {
    return false;
  }

  const expectedHeader = `${CRON_AUTHORIZATION_SCHEME} ${expectedSecret}`;
  const providedBuffer = Buffer.from(providedHeader);
  const expectedBuffer = Buffer.from(expectedHeader);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * Runs one orphan-image cleanup sweep on a cron schedule.
 *
 * @param request - HTTP request carrying the cron bearer token and tracing headers.
 * @returns JSON response with the sweep counters or a safe failure status.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return createJsonResponse(
      { status: IMAGE_CLEANUP_ROUTE_RESPONSE.unauthorized },
      HTTP_STATUS.unauthorized
    );
  }

  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: IMAGE_CLEANUP_ROUTE_LOG.feature,
    operation: IMAGE_CLEANUP_ROUTE_LOG.operation,
    requestId,
  });

  try {
    const modules = await createRequestModules({ requestId });
    const summary =
      await modules.messages.useCases.cleanupOrphanMessageImages();

    logger.info({
      message: IMAGE_CLEANUP_ROUTE_LOG.completedMessage,
      metadata: { ...summary },
    });

    return createJsonResponse(
      { status: IMAGE_CLEANUP_ROUTE_RESPONSE.ok, ...summary },
      HTTP_STATUS.ok
    );
  } catch (error) {
    logger.error({
      message: IMAGE_CLEANUP_ROUTE_LOG.failureMessage,
      error,
    });

    return createJsonResponse(
      { status: IMAGE_CLEANUP_ROUTE_RESPONSE.unexpected },
      HTTP_STATUS.serverError
    );
  }
}
