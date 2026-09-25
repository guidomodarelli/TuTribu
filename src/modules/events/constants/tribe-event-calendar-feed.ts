/**
 * Behavior values of the personal calendar feed (webcal subscription) of a
 * tribe. See `docs/architecture/tribe-events.htm`, section 13.
 */

const MINUTES_PER_HOUR = 60;
const CACHE_MAX_AGE_MINUTES = 5;
const SECONDS_PER_MINUTE = 60;
const TOKEN_BYTE_LENGTH = 32;
/** base64url without padding encodes every 3 bytes as 4 characters. */
const BASE64URL_BITS_PER_CHARACTER = 6;
const BITS_PER_BYTE = 8;

/**
 * Window and limits of one feed response. Series are included when one of
 * their slots can fall between `pastWindowDays` ago and `futureWindowDays`
 * ahead; calendar apps expand the RRULE themselves. `maxComponents` caps the
 * VEVENTs (series plus moved-date overrides) of a single response and
 * `maxExceptions` the cancelled or moved dates read for them.
 */
export const TRIBE_EVENT_CALENDAR_FEED_WINDOW = {
  futureWindowDays: 365,
  maxComponents: 500,
  maxExceptions: 2000,
  pastWindowDays: 90,
} as const;

/**
 * Refresh hints for calendar apps and HTTP caches. `refreshIntervalMinutes`
 * feeds `REFRESH-INTERVAL`/`X-PUBLISHED-TTL`; the private `max-age` stays
 * short so a revoked link stops working soon even for a caching client.
 */
export const TRIBE_EVENT_CALENDAR_FEED_REFRESH = {
  cacheMaxAgeSeconds: CACHE_MAX_AGE_MINUTES * SECONDS_PER_MINUTE,
  /** `last_used_at` is written at most once per this many minutes. */
  lastUsedRefreshMinutes: MINUTES_PER_HOUR,
  refreshIntervalMinutes: MINUTES_PER_HOUR,
} as const;

/**
 * Personal feed token: 32 random bytes (256 bits) encoded as base64url
 * without padding (43 characters). Only its SHA-256 hex digest is stored.
 */
export const TRIBE_EVENT_CALENDAR_FEED_TOKEN = {
  byteLength: TOKEN_BYTE_LENGTH,
  encodedLength: Math.ceil((TOKEN_BYTE_LENGTH * BITS_PER_BYTE) / BASE64URL_BITS_PER_CHARACTER),
  fileExtension: ".ics",
} as const;

/**
 * Time zone announced to calendar apps (`X-WR-TIMEZONE`). Instants in the
 * feed are UTC; this only sets the calendar's default display zone.
 */
export const TRIBE_EVENT_CALENDAR_FEED_TIME_ZONE = "America/Argentina/Buenos_Aires";

/**
 * Path segments of the public feed URL:
 * `/api/calendar/tribes/<slug>/feed/<token>.ics`.
 */
export const TRIBE_EVENT_CALENDAR_FEED_ROUTE = {
  feedSegment: "/feed/",
  tribesPrefix: "/api/calendar/tribes/",
} as const;

/**
 * Why a feed request found nothing; only logged, never shown: the route
 * always answers the same generic 404.
 */
export const TRIBE_EVENT_CALENDAR_FEED_MISS_REASON = {
  accessRevoked: "access_revoked",
  unknownToken: "unknown_token",
} as const;
