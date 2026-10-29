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

import { CRON_SWEEP_RESPONSE_STATUS, handleCronSweepRoute } from "../cron-sweep-route";

const FILE_CLEANUP_ROUTE_LOG = {
  completedMessage: "Orphan file cleanup sweep completed",
  failureMessage: "Orphan file cleanup sweep failed",
  feature: "attachments",
  operation: "cleanup-orphan-attachment-files",
} as const;

/**
 * Runs one orphan-file cleanup sweep on a cron schedule: message attachments
 * (which also drain the shared CASCADE queue) and lesson attachments.
 *
 * @param request - HTTP request carrying the cron bearer token and tracing headers.
 * @returns JSON response with the sweep counters or a safe failure status.
 */
export async function GET(request: Request) {
  return handleCronSweepRoute(request, FILE_CLEANUP_ROUTE_LOG, async (modules) => {
    const messageFilesSummary = await modules.messages.useCases.cleanupOrphanMessageFiles();
    const lessonFilesSummary = await modules.courses.useCases.cleanupOrphanLessonFiles();

    return {
      body: {
        lessonFiles: lessonFilesSummary,
        messageFiles: messageFilesSummary,
        status: CRON_SWEEP_RESPONSE_STATUS.ok,
      },
      metadata: { lessonFiles: lessonFilesSummary, messageFiles: messageFilesSummary },
    };
  });
}
