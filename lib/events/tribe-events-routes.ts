import { ROUTES } from "@/src/constants/routes";
import type { TribeEventType } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENTS_ROUTE_QUERY } from "@/src/modules/events/constants/tribe-events";

/**
 * Pure URL builders for the tribe events page and its same-origin route
 * handlers. Framework-safe: no fetch, no transport concerns, so presentational
 * components and the browser HTTP adapter can share them.
 */

const EVENT_API_ENDPOINT = {
  attendanceExportPath: "/attendance/export",
  attendancePath: "/attendance",
  attendanceStreakPath: "/attendance-streak",
  eventsPath: "/events",
  exceptionsPath: "/exceptions",
  monthQuery: "?month=",
  monthQueryContinuation: "&month=",
  occurrenceQuery: "?occurrence=",
  separator: "/",
} as const;

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

/**
 * Builds the events collection endpoint of a tribe.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @param month - Optional visible month (`YYYY-MM`) sent as query.
 * @returns Relative URL such as `/api/tribes/slug/events?month=2026-05`.
 */
export function buildTribeEventsApiEndpoint(tribeSlug: string, month?: string): string {
  const base =
    ROUTES.api.tribes + EVENT_API_ENDPOINT.separator + tribeSlug + EVENT_API_ENDPOINT.eventsPath;

  return month ? base + EVENT_API_ENDPOINT.monthQuery + month : base;
}

/**
 * Builds the endpoint of one event series.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @param eventId - Event series identifier.
 * @param month - Optional visible month (`YYYY-MM`) sent as query.
 * @returns Relative URL of the event series endpoint.
 */
export function buildTribeEventApiEndpoint(
  tribeSlug: string,
  eventId: string,
  month?: string
): string {
  const base = buildTribeEventsApiEndpoint(tribeSlug) + EVENT_API_ENDPOINT.separator + eventId;

  return month ? base + EVENT_API_ENDPOINT.monthQuery + month : base;
}

/**
 * Builds the attendance endpoint of one event, optionally scoped to one
 * occurrence start.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @param eventId - Event series identifier.
 * @param occurrenceStartsAt - Optional ISO start of the occurrence.
 * @returns Relative URL of the attendance endpoint.
 */
export function buildTribeEventAttendanceApiEndpoint(
  tribeSlug: string,
  eventId: string,
  occurrenceStartsAt?: string
): string {
  const base = buildTribeEventApiEndpoint(tribeSlug, eventId) + EVENT_API_ENDPOINT.attendancePath;

  return occurrenceStartsAt
    ? base + EVENT_API_ENDPOINT.occurrenceQuery + encodeURIComponent(occurrenceStartsAt)
    : base;
}

/**
 * Builds the viewer attendance streak endpoint of a tribe.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @returns Relative URL of the attendance streak endpoint.
 */
export function buildTribeEventAttendanceStreakApiEndpoint(tribeSlug: string): string {
  return buildTribeEventsApiEndpoint(tribeSlug) + EVENT_API_ENDPOINT.attendanceStreakPath;
}

/**
 * Same-origin URL of the manager CSV export of one occurrence. The route
 * handler authorizes the download again, so the link is safe to render.
 *
 * @param input - Tribe, event, and occurrence start.
 * @returns Relative URL of the CSV download.
 */
export function buildTribeEventAttendanceExportUrl(input: {
  eventId: string;
  occurrenceStartsAt: string;
  tribeSlug: string;
}): string {
  return (
    buildTribeEventApiEndpoint(input.tribeSlug, input.eventId) +
    EVENT_API_ENDPOINT.attendanceExportPath +
    EVENT_API_ENDPOINT.occurrenceQuery +
    encodeURIComponent(input.occurrenceStartsAt)
  );
}

/**
 * Builds the date exceptions endpoint of one event series, with the visible
 * month and, to restore a date, its original start.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @param eventId - Event series identifier.
 * @param query - Visible month (`YYYY-MM`) and optional original start.
 * @returns Relative URL such as `/api/tribes/slug/events/id/exceptions?month=2026-05`.
 */
export function buildTribeEventExceptionsApiEndpoint(
  tribeSlug: string,
  eventId: string,
  query: { month: string; originalStartsAt?: string }
): string {
  const base = buildTribeEventApiEndpoint(tribeSlug, eventId) + EVENT_API_ENDPOINT.exceptionsPath;

  return query.originalStartsAt
    ? base +
        EVENT_API_ENDPOINT.occurrenceQuery +
        encodeURIComponent(query.originalStartsAt) +
        EVENT_API_ENDPOINT.monthQueryContinuation +
        query.month
    : base + EVENT_API_ENDPOINT.monthQuery + query.month;
}
