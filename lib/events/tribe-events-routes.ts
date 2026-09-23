import { ROUTES } from "@/src/constants/routes";
import { TRIBE_EVENTS_ROUTE_QUERY } from "@/src/modules/events/constants/tribe-events";

/**
 * Query values accepted by the tribe events page. Both are optional: without
 * `month` the route resolves the current Buenos Aires month.
 */
export type TribeEventsRouteQuery = {
  month?: string;
  occurrenceKey?: string;
};

/**
 * Builds the tribe events page URL, adding only the query values provided.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @param query - Optional visible month and occurrence to open.
 * @returns Relative URL such as `/slug/eventos?month=2026-05`.
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

  const queryString = searchParams.toString();

  return queryString
    ? ROUTES.tribes.events(tribeSlug) + "?" + queryString
    : ROUTES.tribes.events(tribeSlug);
}
