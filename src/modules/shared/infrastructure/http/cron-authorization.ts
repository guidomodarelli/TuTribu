import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Authorization of the scheduled maintenance routes (`app/api/maintenance/**`).
 * Vercel Cron and the Cloudflare `scheduled` handler both call them with
 * `Authorization: Bearer <CRON_SECRET>`; nothing else may run them.
 */

const CRON_AUTHORIZATION_SCHEME = "Bearer";
const AUTHORIZATION_HEADER = "authorization";

/**
 * Verifies that the request carries the shared cron bearer token, comparing
 * in constant time. A missing `CRON_SECRET` rejects every request, so a
 * misconfigured deployment never runs maintenance unauthenticated.
 *
 * @param request - Incoming cron request.
 * @param expectedSecret - Shared secret; defaults to `process.env.CRON_SECRET`.
 * @returns Whether the request is an authorized cron invocation.
 */
export function isAuthorizedCronRequest(
  request: Request,
  expectedSecret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!expectedSecret) {
    return false;
  }

  const providedHeader = request.headers.get(AUTHORIZATION_HEADER);

  if (!providedHeader) {
    return false;
  }

  const providedBuffer = Buffer.from(providedHeader);
  const expectedBuffer = Buffer.from(`${CRON_AUTHORIZATION_SCHEME} ${expectedSecret}`);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
