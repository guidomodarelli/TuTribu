import { ROUTES } from "@/src/constants/routes";
import type { TribeEventType } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENTS_ROUTE_QUERY } from "@/src/modules/events/constants/tribe-events";

/**
 * Query values accepted by the tribe events page. All are optional: without
 * `month` the route resolves the current Buenos Aires month; without
 * `eventTypes` every type is shown.
 */
export type TribeEventsRouteQuery = {
  eventTypes?: readonly TribeEventType[];
  month?: string;
  occurrenceKey?: string;
};

/**
 * Builds the tribe events page URL, adding only the query values provided.
 * Each selected type becomes its own `type` parameter.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @param query - Optional visible month, occurrence to open, and type filter.
 * @returns Relative URL such as `/slug/eventos?month=2026-05&type=live`.
 */
export function buildTribeEventsRoute(
  tribeSlug: string,
  query: TribeEventsRouteQuery = {}
): string {
  const searchParams = new URLSearchParams();

  if (query.month) {
    searchParams.set(TRIBE_EVENTS_ROUTE_QUERY.month, query.month);
  }

  if (query.occurrenceKey) {
    searchParams.set(TRIBE_EVENTS_ROUTE_QUERY.event, query.occurrenceKey);
  }

  for (const eventType of query.eventTypes ?? []) {
    searchParams.append(TRIBE_EVENTS_ROUTE_QUERY.type, eventType);
  }

  const queryString = searchParams.toString();

  return queryString
    ? ROUTES.tribes.events(tribeSlug) + "?" + queryString
    : ROUTES.tribes.events(tribeSlug);
}
