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

/** Route that runs one orphan attachment-file (R2) cleanup sweep. */
export const FILE_CLEANUP_MAINTENANCE_PATH = "/api/maintenance/file-cleanup";

/**
 * Route that enqueues the due event reminders and purges old read
 * notifications (in-app notifications, every 5 minutes).
 */
export const EVENT_REMINDERS_MAINTENANCE_PATH = "/api/maintenance/event-reminders";

/**
 * Cron expressions installed in `wrangler.jsonc` (`triggers.crons`), keyed by
 * the maintenance route each one re-enters. They must stay in sync with the
 * matching schedules in `vercel.json` so both deployment targets sweep at the
 * same time.
 */
export const MAINTENANCE_CRON_SCHEDULE = {
  eventReminders: "*/5 * * * *",
  fileCleanup: "30 4 * * *",
  imageCleanup: "0 4 * * *",
} as const;

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
    "Scheduled maintenance cleanup skipped: CRON_SECRET is not configured on the Cloudflare Worker",
  requestFailed: "Scheduled maintenance cleanup request failed with status",
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

interface RunScheduledMaintenanceCleanupInput
  extends RunScheduledImageCleanupInput {
  /**
   * Cron expression delivered by the Cloudflare `scheduled` event. With more
   * than one entry in `triggers.crons`, this is the only way to tell which
   * maintenance route the firing schedule belongs to.
   */
  cron: string;
}

/**
 * Resolves which maintenance route a firing Cloudflare cron expression should
 * re-enter. Unknown expressions fall back to the image cleanup route so a
 * schedule tweak in `wrangler.jsonc` never silently skips maintenance.
 *
 * @param cron - Cron expression from the scheduled event.
 * @returns The maintenance route the schedule targets.
 */
export function resolveMaintenancePathForCron(cron: string): string {
  if (cron === MAINTENANCE_CRON_SCHEDULE.fileCleanup) {
    return FILE_CLEANUP_MAINTENANCE_PATH;
  }

  if (cron === MAINTENANCE_CRON_SCHEDULE.eventReminders) {
    return EVENT_REMINDERS_MAINTENANCE_PATH;
  }

  return IMAGE_CLEANUP_MAINTENANCE_PATH;
}

/**
 * Builds the authorized cron request for a maintenance route.
 *
 * @param cronSecret - Shared maintenance cron secret.
 * @param maintenancePath - Maintenance route to re-enter.
 * @returns A `GET` request carrying the `Bearer` cron token.
 */
export function buildMaintenanceCronRequest(
  cronSecret: string,
  maintenancePath: string
): Request {
  return new Request(`${INTERNAL_WORKER_ORIGIN}${maintenancePath}`, {
    headers: {
      authorization: `${CRON_AUTHORIZATION_SCHEME} ${cronSecret}`,
    },
    method: MAINTENANCE_REQUEST_METHOD,
  });
}

/**
 * Builds the authorized cron request for the orphan-image cleanup route.
 *
 * @param cronSecret - Shared maintenance cron secret.
 * @returns A `GET` request carrying the `Bearer` cron token.
 */
export function buildImageCleanupCronRequest(cronSecret: string): Request {
  return buildMaintenanceCronRequest(cronSecret, IMAGE_CLEANUP_MAINTENANCE_PATH);
}

async function runScheduledCleanupForPath(
  { fetchHandler, env, context }: RunScheduledImageCleanupInput,
  maintenancePath: string
): Promise<void> {
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error(SCHEDULED_MAINTENANCE_ERROR.missingSecret);
  }

  const request = buildMaintenanceCronRequest(cronSecret, maintenancePath);
  const response = await fetchHandler(request, env, context);

  if (!response.ok) {
    throw new Error(
      `${SCHEDULED_MAINTENANCE_ERROR.requestFailed} ${response.status}`
    );
  }
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
export async function runScheduledImageCleanup(
  input: RunScheduledImageCleanupInput
): Promise<void> {
  await runScheduledCleanupForPath(input, IMAGE_CLEANUP_MAINTENANCE_PATH);
}

/**
 * Dispatches a firing Cloudflare cron to its maintenance route (orphan images
 * or orphan R2 attachment files) and re-enters it through the worker fetch
 * handler with the shared cron bearer token.
 *
 * @param input - Worker fetch handler, scheduled env/context, and the firing
 *   cron expression.
 */
export async function runScheduledMaintenanceCleanup(
  input: RunScheduledMaintenanceCleanupInput
): Promise<void> {
  await runScheduledCleanupForPath(
    input,
    resolveMaintenancePathForCron(input.cron)
  );
}
