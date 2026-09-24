import {
  TRIBE_EVENT_HTTP_REQUEST,
  buildEventsEndpoint,
  readTribeEventResponse,
  type TribeEventRequestResult,
} from "@/lib/events/tribe-events-api-client";
import {
  tribeEventCalendarFeedIssueResponseSchema,
  tribeEventCalendarFeedRevokeResponseSchema,
  tribeEventCalendarFeedStatusResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import type { TribeEventCalendarFeedSubscriptionResult } from "@/src/modules/events/application/results/tribe-event-result";

/**
 * Browser adapter of `/api/tribes/[slug]/events/calendar-feed`. Every body is
 * validated with its public DTO schema; the personal feed URL only lives in
 * the caller's memory (never cached: the requests use `cache: "no-store"`).
 */

const CALENDAR_FEED_ENDPOINT_PATH = "/calendar-feed";
const NO_STORE_CACHE: RequestCache = "no-store";

function buildCalendarFeedEndpoint(tribeSlug: string): string {
  return buildEventsEndpoint(tribeSlug) + CALENDAR_FEED_ENDPOINT_PATH;
}

/**
 * Whether the viewer already has an active calendar link.
 *
 * @param input - Tribe and an abort signal so a stale load never updates the UI.
 * @returns The subscription (or null) or the safe failure message.
 */
export async function fetchTribeEventCalendarFeedRequest(input: {
  signal?: AbortSignal;
  tribeSlug: string;
}): Promise<
  TribeEventRequestResult<{ subscription: TribeEventCalendarFeedSubscriptionResult | null }>
> {
  const response = await fetch(buildCalendarFeedEndpoint(input.tribeSlug), {
    cache: NO_STORE_CACHE,
    signal: input.signal,
  });
  const result = await readTribeEventResponse(
    response,
    tribeEventCalendarFeedStatusResponseSchema
  );

  return result.isUsable
    ? { isSuccess: true, message: null, subscription: result.dto.subscription }
    : { isSuccess: false, message: result.message };
}

/**
 * Generates or regenerates the personal link (the previous one stops working).
 *
 * @param input - Tribe of the calendar.
 * @returns The https feed URL (shown once) and the subscription dates.
 */
export async function issueTribeEventCalendarFeedRequest(input: {
  tribeSlug: string;
}): Promise<
  TribeEventRequestResult<{
    feedUrl: string;
    subscription: TribeEventCalendarFeedSubscriptionResult;
  }>
> {
  const response = await fetch(buildCalendarFeedEndpoint(input.tribeSlug), {
    cache: NO_STORE_CACHE,
    method: TRIBE_EVENT_HTTP_REQUEST.methodPost,
  });
  const result = await readTribeEventResponse(response, tribeEventCalendarFeedIssueResponseSchema);

  return result.isUsable
    ? {
        feedUrl: result.dto.feedUrl,
        isSuccess: true,
        message: result.dto.message,
        subscription: result.dto.subscription,
      }
    : { isSuccess: false, message: result.message };
}

/**
 * Turns the subscription off (idempotent).
 *
 * @param input - Tribe of the calendar.
 * @returns Whether the link was revoked, with the route message.
 */
export async function revokeTribeEventCalendarFeedRequest(input: {
  tribeSlug: string;
}): Promise<TribeEventRequestResult<Record<never, never>>> {
  const response = await fetch(buildCalendarFeedEndpoint(input.tribeSlug), {
    cache: NO_STORE_CACHE,
    method: TRIBE_EVENT_HTTP_REQUEST.methodDelete,
  });
  const result = await readTribeEventResponse(response, tribeEventCalendarFeedRevokeResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: result.dto.message }
    : { isSuccess: false, message: result.message };
}
