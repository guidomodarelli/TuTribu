import { createHash } from "node:crypto";

import { TRIBE_EVENT_CALENDAR_FEED_REFRESH } from "@/src/modules/events/constants/tribe-event-calendar-feed";

/**
 * HTTP details of the public calendar feed: plain-text safe responses (a
 * calendar app shows no JSON), privacy headers, and the content ETag that
 * lets a polling client get `304 Not Modified`.
 */

export const TRIBE_EVENT_CALENDAR_FEED_HTTP_STATUS = {
  badRequest: 400,
  notFound: 404,
  notModified: 304,
  ok: 200,
  serverError: 500,
} as const;

const HEADER = {
  cacheControl: "Cache-Control",
  contentType: "Content-Type",
  contentTypeOptions: "X-Content-Type-Options",
  etag: "ETag",
  ifNoneMatch: "If-None-Match",
  referrerPolicy: "Referrer-Policy",
  robotsTag: "X-Robots-Tag",
} as const;

const HEADER_VALUE = {
  noReferrer: "no-referrer",
  noSniff: "nosniff",
  noStore: "no-store",
  noIndex: "noindex, nofollow",
  plainText: "text/plain; charset=utf-8",
  privateMaxAgePrefix: "private, max-age=",
} as const;

const ETAG = {
  anyMatch: "*",
  digestAlgorithm: "sha256",
  digestEncoding: "base64url",
  listSeparator: ",",
  quote: '"',
  weakPrefix: "W/",
} as const;

/**
 * Headers every feed response carries: the URL holds a credential, so it must
 * never leak through a Referer, be indexed, or be content-sniffed.
 */
const PRIVACY_HEADERS = {
  [HEADER.contentTypeOptions]: HEADER_VALUE.noSniff,
  [HEADER.referrerPolicy]: HEADER_VALUE.noReferrer,
  [HEADER.robotsTag]: HEADER_VALUE.noIndex,
} as const;

const CACHE_HEADER_VALUE =
  HEADER_VALUE.privateMaxAgePrefix + TRIBE_EVENT_CALENDAR_FEED_REFRESH.cacheMaxAgeSeconds;

/**
 * Strong ETag of a feed body. The body is deterministic for the same data
 * (DTSTAMP comes from the last change, not the clock), so equal ETags mean
 * the calendar did not change.
 */
export function buildCalendarFeedEtag(content: string): string {
  return (
    ETAG.quote +
    createHash(ETAG.digestAlgorithm).update(content).digest(ETAG.digestEncoding) +
    ETAG.quote
  );
}

/**
 * Whether `If-None-Match` (a list, possibly weak or `*`) matches the ETag.
 * Weak comparison is enough for a GET revalidation (RFC 9110 §13.1.2).
 */
export function matchesIfNoneMatch(request: Request, etag: string): boolean {
  const header = request.headers.get(HEADER.ifNoneMatch);

  if (!header) {
    return false;
  }

  return header
    .split(ETAG.listSeparator)
    .map((candidate) => candidate.trim())
    .some(
      (candidate) =>
        candidate === ETAG.anyMatch ||
        (candidate.startsWith(ETAG.weakPrefix)
          ? candidate.slice(ETAG.weakPrefix.length)
          : candidate) === etag
    );
}

/**
 * `200` with the calendar body.
 */
export function createCalendarFeedResponse(input: {
  content: string;
  contentType: string;
  etag: string;
}): Response {
  return new Response(input.content, {
    headers: {
      ...PRIVACY_HEADERS,
      [HEADER.cacheControl]: CACHE_HEADER_VALUE,
      [HEADER.contentType]: input.contentType,
      [HEADER.etag]: input.etag,
    },
    status: TRIBE_EVENT_CALENDAR_FEED_HTTP_STATUS.ok,
  });
}

/**
 * `304` without a body; the client keeps its copy.
 */
export function createCalendarFeedNotModifiedResponse(etag: string): Response {
  return new Response(null, {
    headers: {
      ...PRIVACY_HEADERS,
      [HEADER.cacheControl]: CACHE_HEADER_VALUE,
      [HEADER.etag]: etag,
    },
    status: TRIBE_EVENT_CALENDAR_FEED_HTTP_STATUS.notModified,
  });
}

/**
 * Safe plain-text failure (never cached): the same 404 body answers an
 * unknown token, a revoked one, and an owner without access, so the response
 * never tells whether a token exists.
 */
export function createCalendarFeedTextResponse(message: string, status: number): Response {
  return new Response(message, {
    headers: {
      ...PRIVACY_HEADERS,
      [HEADER.cacheControl]: HEADER_VALUE.noStore,
      [HEADER.contentType]: HEADER_VALUE.plainText,
    },
    status,
  });
}

const REDACTED_TOKEN = "[redacted-token]";

/**
 * Copy of an error safe to log: the plain token is replaced in its message
 * and stack (a wrapped driver or framework error could quote the URL).
 *
 * @param error - Caught error of the feed flow.
 * @param token - Token of the request, never written to a log.
 * @returns An `Error` with the same name and the redacted text.
 */
export function redactCalendarFeedToken(error: unknown, token: string): Error {
  const redact = (text: string) => text.split(token).join(REDACTED_TOKEN);
  const source = error instanceof Error ? error : new Error(String(error));
  const redactedError = new Error(redact(source.message));

  redactedError.name = source.name;
  redactedError.stack = source.stack ? redact(source.stack) : undefined;

  return redactedError;
}
