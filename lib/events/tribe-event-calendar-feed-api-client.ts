import {
  TRIBE_EVENT_HTTP_REQUEST,
  TRIBE_EVENT_JSON_HEADERS,
  readTribeEventResponse,
  type TribeEventRequestResult,
} from "@/lib/events/tribe-events-api-client";
import { buildTribeEventsApiEndpoint } from "@/lib/events/tribe-events-routes";
import {
  tribeEventCalendarFeedIssueResponseSchema,
  tribeEventCalendarFeedRevokeResponseSchema,
  tribeEventCalendarFeedStatusResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import type { TribeEventCalendarFeedSubscriptionResult } from "@/src/modules/events/application/results/tribe-event-result";
import type {
  TribeEventCalendarFeedIssueRequestBody,
  TribeEventCalendarFeedRevokeRequestQuery,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-calendar-feed-schemas";

/**
 * Browser adapter of `/api/tribes/[slug]/events/calendar-feed`. Every body is
 * validated with its public DTO schema; the personal feed URL only lives in
 * the caller's memory (never cached: the requests use `cache: "no-store"`).
 */

const CALENDAR_FEED_ENDPOINT_PATH = "/calendar-feed";
const NO_STORE_CACHE: RequestCache = "no-store";
/** The active link changed since the client loaded it (another tab, a retry). */
const SUBSCRIPTION_CHANGED_HTTP_STATUS = 409;

/**
 * Outcome of generating the link. `isSubscriptionChanged` tells the caller
 * that nothing was issued because its view of the subscription is stale.
 */
export type TribeEventCalendarFeedIssueRequestResult =
  | {
      feedUrl: string;
      isSuccess: true;
      message: string | null;
      subscription: TribeEventCalendarFeedSubscriptionResult;
    }
  | { isSubscriptionChanged: boolean; isSuccess: false; message: string | null };

/**
 * Outcome of turning the link off. `isSubscriptionChanged` tells the caller
 * that nothing was revoked because its view of the subscription is stale.
 */
export type TribeEventCalendarFeedRevokeRequestResult =
  | { isSuccess: true; message: string | null }
  | { isSubscriptionChanged: boolean; isSuccess: false; message: string | null };

/** Query key of the revocation precondition, typed by the route contract. */
const EXPECTED_SUBSCRIPTION_QUERY_KEY: keyof TribeEventCalendarFeedRevokeRequestQuery =
  "expectedSubscriptionId";

function buildCalendarFeedEndpoint(tribeSlug: string): string {
  return buildTribeEventsApiEndpoint(tribeSlug) + CALENDAR_FEED_ENDPOINT_PATH;
}

/**
 * Revocation endpoint with the subscription the caller shows as precondition;
 * without one the parameter is omitted (the route reads it as null).
 */
function buildCalendarFeedRevokeEndpoint(
  tribeSlug: string,
  expectedSubscriptionId: string | null
): string {
  const endpoint = buildCalendarFeedEndpoint(tribeSlug);

  if (expectedSubscriptionId === null) {
    return endpoint;
  }

  const query = new URLSearchParams({ [EXPECTED_SUBSCRIPTION_QUERY_KEY]: expectedSubscriptionId });

  return `${endpoint}?${query.toString()}`;
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
 * It sends the id of the subscription the caller shows (null: none) so the
 * server issues nothing when another tab or a retry already changed it.
 *
 * @param input - Tribe of the calendar and the subscription the caller knows.
 * @returns The https feed URL (shown once) and the subscription, or the safe
 * failure message and whether the caller's subscription state is stale.
 */
export async function issueTribeEventCalendarFeedRequest(input: {
  expectedSubscriptionId: string | null;
  tribeSlug: string;
}): Promise<TribeEventCalendarFeedIssueRequestResult> {
  const body: TribeEventCalendarFeedIssueRequestBody = {
    expectedSubscriptionId: input.expectedSubscriptionId,
  };
  const response = await fetch(buildCalendarFeedEndpoint(input.tribeSlug), {
    body: JSON.stringify(body),
    cache: NO_STORE_CACHE,
    headers: TRIBE_EVENT_JSON_HEADERS,
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
    : {
        isSubscriptionChanged: response.status === SUBSCRIPTION_CHANGED_HTTP_STATUS,
        isSuccess: false,
        message: result.message,
      };
}

/**
 * Turns the subscription off. It sends the id of the subscription the caller
 * shows (null: none) so the server revokes nothing when another tab already
 * replaced it; without an active link, while the caller shows none, it is
 * idempotent.
 *
 * @param input - Tribe of the calendar and the subscription the caller knows.
 * @returns Whether the link was revoked, with the route message, and whether
 * the caller's subscription state is stale.
 */
export async function revokeTribeEventCalendarFeedRequest(input: {
  expectedSubscriptionId: string | null;
  tribeSlug: string;
}): Promise<TribeEventCalendarFeedRevokeRequestResult> {
  const response = await fetch(
    buildCalendarFeedRevokeEndpoint(input.tribeSlug, input.expectedSubscriptionId),
    {
      cache: NO_STORE_CACHE,
      method: TRIBE_EVENT_HTTP_REQUEST.methodDelete,
    }
  );
  const result = await readTribeEventResponse(response, tribeEventCalendarFeedRevokeResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: result.dto.message }
    : {
        isSubscriptionChanged: response.status === SUBSCRIPTION_CHANGED_HTTP_STATUS,
        isSuccess: false,
        message: result.message,
      };
}
