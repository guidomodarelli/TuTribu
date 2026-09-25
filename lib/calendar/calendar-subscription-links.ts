/**
 * Links that hand a subscribed calendar feed to calendar apps. Both reuse the
 * same https feed URL: Apple Calendar (and Outlook on macOS/iOS) subscribes
 * through the `webcal://` scheme, and Google Calendar needs the public https
 * URL in its `cid` parameter.
 */

const CALENDAR_SUBSCRIPTION = {
  googleCidParam: "cid",
  googleRenderUrl: "https://calendar.google.com/calendar/render",
  httpPattern: /^https?:\/\//,
  webcalPrefix: "webcal://",
} as const;

/**
 * `webcal://` variant of the feed, which opens the subscription dialog of
 * Apple Calendar and other system calendar apps.
 *
 * @param feedUrl - Absolute https feed URL.
 * @returns The same URL with the `webcal` scheme.
 */
export function buildAppleCalendarSubscriptionUrl(feedUrl: string): string {
  return feedUrl.replace(CALENDAR_SUBSCRIPTION.httpPattern, CALENDAR_SUBSCRIPTION.webcalPrefix);
}

/**
 * Google Calendar "add by URL" link for the feed.
 *
 * @param feedUrl - Absolute https feed URL (Google fetches it from its servers).
 * @returns The Google Calendar URL that proposes the subscription.
 */
export function buildGoogleCalendarSubscriptionUrl(feedUrl: string): string {
  const googleUrl = new URL(CALENDAR_SUBSCRIPTION.googleRenderUrl);

  googleUrl.searchParams.set(CALENDAR_SUBSCRIPTION.googleCidParam, feedUrl);

  return googleUrl.toString();
}
