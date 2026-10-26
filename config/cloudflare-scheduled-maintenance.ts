/**
 * Scheduled maintenance trigger for the Cloudflare Workers deployment target.
 *
 * Vercel installs the daily cleanup crons from `vercel.json`, but the
 * OpenNext Cloudflare worker has no equivalent scheduler. This module holds the
 * testable logic that the Cloudflare `scheduled` handler uses to re-enter the
 * same maintenance routes, so abandoned drafts and the cascade-orphan queue
 * are swept on both targets. The 5-minute event-reminders route is triggered
 * here on Cloudflare and by GitHub Actions
 * (`.github/workflows/event-reminders-cron.yml`) on Vercel, whose Hobby plan
 * only allows daily crons.
 *
 * The fetch handler is injected so the orchestration is unit-testable without
 * importing the generated `.open-next/worker.js`, which only exists after a
 * Cloudflare build.
 *
 * @module cloudflare-scheduled-maintenance
 */

import { ADMISSION_MAINTENANCE_TRIGGER, ADMISSION_MAINTENANCE_TRIGGER_ERROR } from "../src/modules/messaging/constants/admission-maintenance-trigger.mjs";
import { isAdmissionMaintenanceEnabled } from "../src/modules/messaging/infrastructure/config/admission-maintenance-config.mjs";
import { AdmissionMaintenanceTriggerError } from "../src/modules/messaging/infrastructure/errors/admission-maintenance-trigger-error.mjs";
import { IMAGE_CLEANUP_MAINTENANCE_PATH, FILE_CLEANUP_MAINTENANCE_PATH, EVENT_REMINDERS_MAINTENANCE_PATH, MAINTENANCE_CRON_SCHEDULE, CRON_AUTHORIZATION_SCHEME, INTERNAL_WORKER_ORIGIN, MAINTENANCE_REQUEST_METHOD, SCHEDULED_MAINTENANCE_ERROR } from "./constants/cloudflare-scheduled-maintenance";
export { IMAGE_CLEANUP_MAINTENANCE_PATH, FILE_CLEANUP_MAINTENANCE_PATH, EVENT_REMINDERS_MAINTENANCE_PATH, MAINTENANCE_CRON_SCHEDULE } from "./constants/cloudflare-scheduled-maintenance";

/** Subset of the Cloudflare env the scheduled maintenance trigger reads. */
interface CronSecretEnvironment {
  CRON_SECRET?: string;
  ADMISSION_MESSAGING_MAINTENANCE_ENABLED?: string;
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
  if (cron === ADMISSION_MAINTENANCE_TRIGGER.cron) return ADMISSION_MAINTENANCE_TRIGGER.path;
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
  const admission = maintenancePath === ADMISSION_MAINTENANCE_TRIGGER.path;
  if (admission && !isAdmissionMaintenanceEnabled(env)) throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.disabled);
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret) {
    if (admission) throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.missingSecret);
    throw new Error(SCHEDULED_MAINTENANCE_ERROR.missingSecret);
  }

  const request = buildMaintenanceCronRequest(cronSecret, maintenancePath);
  let response: Response;
  try { response = await fetchHandler(request, env, context); }
  catch (error) {
    if (admission) throw new AdmissionMaintenanceTriggerError(ADMISSION_MAINTENANCE_TRIGGER_ERROR.requestUnconfirmed, { cause: error });
    throw error;
  }

  if (admission && response.status !== ADMISSION_MAINTENANCE_TRIGGER.completedHttpStatus) throw new AdmissionMaintenanceTriggerError(response.status === ADMISSION_MAINTENANCE_TRIGGER.busyHttpStatus ? ADMISSION_MAINTENANCE_TRIGGER_ERROR.requestUnconfirmed : ADMISSION_MAINTENANCE_TRIGGER_ERROR.requestFailed, { status: response.status });

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
