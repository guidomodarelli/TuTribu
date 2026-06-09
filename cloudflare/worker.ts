// @ts-nocheck - Cloudflare Workers build glue. This entrypoint imports the
// generated `.open-next/worker.js` (absent until `opennextjs-cloudflare build`)
// and relies on ambient Workers types from the untracked `cloudflare-env.d.ts`,
// neither of which exists during `next build`. It is transpiled and bundled by
// wrangler/esbuild for Cloudflare; all testable logic lives in
// `config/cloudflare-scheduled-maintenance.ts`.
/**
 * Custom Cloudflare Workers entrypoint for the OpenNext deployment target.
 *
 * It re-uses the generated OpenNext `fetch` handler and adds a `scheduled`
 * handler so the orphan-image cleanup sweep runs on Cloudflare too. Vercel
 * installs that cron from `vercel.json`; the matching Cloudflare cron lives in
 * `wrangler.jsonc` under `triggers.crons` and dispatches here.
 *
 * @module cloudflare-worker
 */

import { default as openNextHandler } from "../.open-next/worker.js";

import { runScheduledImageCleanup } from "../config/cloudflare-scheduled-maintenance";

export default {
  fetch: openNextHandler.fetch,

  async scheduled(
    _event: ScheduledController,
    env: CloudflareEnv,
    context: ExecutionContext
  ): Promise<void> {
    const sweep = runScheduledImageCleanup({
      context,
      env,
      fetchHandler: openNextHandler.fetch,
    });

    // `waitUntil` keeps the worker alive until the sweep settles; awaiting it
    // propagates a failure so the cron run is marked failed in Cloudflare.
    context.waitUntil(sweep);
    await sweep;
  },
} satisfies ExportedHandler<CloudflareEnv>;
