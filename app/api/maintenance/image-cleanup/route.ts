/**
 * Scheduled maintenance endpoint that sweeps orphaned Cloudflare image assets.
 *
 * It is invoked by the Vercel Cron defined in `vercel.json` and is guarded by a
 * shared `CRON_SECRET` bearer token, so it never runs on behalf of an end user.
 *
 * @module orphan-image-cleanup-route
 */

import { CRON_SWEEP_RESPONSE_STATUS, handleCronSweepRoute } from "../cron-sweep-route";

const IMAGE_CLEANUP_ROUTE_LOG = {
  completedMessage: "Orphan image cleanup sweep completed",
  failureMessage: "Orphan image cleanup sweep failed",
  feature: "messages",
  operation: "cleanup-orphan-message-images",
} as const;

/**
 * Runs one orphan-image cleanup sweep on a cron schedule.
 *
 * @param request - HTTP request carrying the cron bearer token and tracing headers.
 * @returns JSON response with the sweep counters or a safe failure status.
 */
export async function GET(request: Request) {
  return handleCronSweepRoute(request, IMAGE_CLEANUP_ROUTE_LOG, async (modules) => {
    const summary = await modules.messages.useCases.cleanupOrphanMessageImages();
    const tribeImagesSummary = await modules.tribes.useCases.cleanupOrphanTribeImages();

    return {
      body: {
        status: CRON_SWEEP_RESPONSE_STATUS.ok,
        ...summary,
        tribeImages: tribeImagesSummary,
      },
      metadata: { ...summary, tribeImages: tribeImagesSummary },
    };
  });
}
