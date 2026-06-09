/**
 * Scheduled maintenance trigger for the Cloudflare Workers deployment target.
 *
 * Vercel installs the orphan-image cleanup cron from `vercel.json`, but the
 * OpenNext Cloudflare worker has no equivalent scheduler. This module holds the
 * testable logic that the Cloudflare `scheduled` handler uses to re-enter the
 * same `/api/maintenance/image-cleanup` route, so abandoned drafts and the
 * cascade-orphan queue are swept on both targets.
 *
 * The fetch handler is injected so the orchestration is unit-testable without
 * importing the generated `.open-next/worker.js`, which only exists after a
 * Cloudflare build.
 *
 * @module cloudflare-scheduled-maintenance
 */

/** Route that runs one orphan-image cleanup sweep. */
export const IMAGE_CLEANUP_MAINTENANCE_PATH = "/api/maintenance/image-cleanup";

/** Authorization scheme the cleanup route expects for the cron bearer token. */
const CRON_AUTHORIZATION_SCHEME = "Bearer";

/**
 * Synthetic origin for the internal cron request. The cleanup route only
 * validates the bearer token and ignores the host, so this never leaves the
 * worker and never reaches the public network.
 */
const INTERNAL_WORKER_ORIGIN = "https://worker.internal";

/** The cleanup route is exposed as a `GET` handler. */
const MAINTENANCE_REQUEST_METHOD = "GET";

const SCHEDULED_MAINTENANCE_ERROR = {
  missingSecret:
    "Scheduled image cleanup skipped: CRON_SECRET is not configured on the Cloudflare Worker",
  requestFailed: "Scheduled image cleanup request failed with status",
} as const;

/** Subset of the Cloudflare env the scheduled maintenance trigger reads. */
interface CronSecretEnvironment {
  CRON_SECRET?: string;
}

/** Subset of the Cloudflare `ExecutionContext` used by the scheduled handler. */
interface ScheduledExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Worker fetch handler signature. Matches the `fetch` exported by the OpenNext
 * generated worker so the scheduled handler can forward the real env/context.
 */
type WorkerFetchHandler = (
  request: Request,
  env: CronSecretEnvironment,
  context: ScheduledExecutionContext
) => Response | Promise<Response>;

interface RunScheduledImageCleanupInput {
  fetchHandler: WorkerFetchHandler;
  env: CronSecretEnvironment;
  context: ScheduledExecutionContext;
}

/**
 * Builds the authorized cron request for the orphan-image cleanup route.
 *
 * @param cronSecret - Shared maintenance cron secret.
 * @returns A `GET` request carrying the `Bearer` cron token.
 */
export function buildImageCleanupCronRequest(cronSecret: string): Request {
  return new Request(`${INTERNAL_WORKER_ORIGIN}${IMAGE_CLEANUP_MAINTENANCE_PATH}`, {
    headers: {
      authorization: `${CRON_AUTHORIZATION_SCHEME} ${cronSecret}`,
    },
    method: MAINTENANCE_REQUEST_METHOD,
  });
}

/**
 * Runs one orphan-image cleanup sweep by re-entering the maintenance route
 * through the worker fetch handler.
 *
 * Throws when the cron secret is missing or the route rejects the request, so a
 * misconfigured or failed sweep surfaces as a failed Cloudflare cron invocation
 * instead of silently swallowing the maintenance run.
 *
 * @param input - Worker fetch handler plus the scheduled env and context.
 */
export async function runScheduledImageCleanup({
  fetchHandler,
  env,
  context,
}: RunScheduledImageCleanupInput): Promise<void> {
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error(SCHEDULED_MAINTENANCE_ERROR.missingSecret);
  }

  const request = buildImageCleanupCronRequest(cronSecret);
  const response = await fetchHandler(request, env, context);

  if (!response.ok) {
    throw new Error(
      `${SCHEDULED_MAINTENANCE_ERROR.requestFailed} ${response.status}`
    );
  }
}
