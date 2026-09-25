import {
  TRIBE_EVENT_CALENDAR_FEED_ROUTE,
  TRIBE_EVENT_CALENDAR_FEED_TOKEN,
} from "@/src/modules/events/constants/tribe-event-calendar-feed";

/**
 * Absolute https URL of a member's personal feed. Calendar apps subscribe to
 * it directly (Google Calendar needs a public https URL) and the UI derives
 * the `webcal://` variant from it.
 *
 * @param input - Public base URL of the app, tribe slug, and plain token.
 * @returns `<base>/api/calendar/tribes/<slug>/feed/<token>.ics`.
 */
export function buildTribeEventCalendarFeedUrl(input: {
  baseUrl: string;
  token: string;
  tribeSlug: string;
}): string {
  return new URL(
    TRIBE_EVENT_CALENDAR_FEED_ROUTE.tribesPrefix +
      input.tribeSlug +
      TRIBE_EVENT_CALENDAR_FEED_ROUTE.feedSegment +
      input.token +
      TRIBE_EVENT_CALENDAR_FEED_TOKEN.fileExtension,
    input.baseUrl
  ).toString();
}
