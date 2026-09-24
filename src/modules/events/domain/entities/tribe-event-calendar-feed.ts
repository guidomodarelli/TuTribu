import type {
  TribeEvent,
  TribeEventOccurrenceException,
} from "@/src/modules/events/domain/entities/tribe-event";

/**
 * Personal subscription of a member to the calendar feed of one tribe. The
 * token itself is never part of the entity: only its hash is stored and the
 * plain value is shown once, when it is issued.
 */
export type TribeEventCalendarFeedSubscription = {
  createdAt: string;
  /** Last feed request served with the token (throttled); null if never used. */
  lastUsedAt: string | null;
};

/**
 * Active token resolved from its hash, before any access check. `tokenHash`
 * is returned so the caller can confirm the match in constant time.
 */
export type TribeEventCalendarFeedTokenOwner = {
  tokenHash: string;
  tokenId: string;
  tribeId: string;
  userId: string;
};

/**
 * Series included in a feed with the instant it last changed. Saving or
 * restoring a date exception also bumps the series `updatedAt`, so this one
 * value drives SEQUENCE, LAST-MODIFIED, and the ETag of the feed.
 */
export type TribeEventCalendarFeedSeries = {
  event: TribeEvent;
  updatedAt: string;
};

/**
 * What the token owner can read of the tribe calendar right now.
 */
export type TribeEventCalendarFeedSnapshot = {
  exceptions: TribeEventOccurrenceException[];
  series: TribeEventCalendarFeedSeries[];
  tribeName: string;
};
