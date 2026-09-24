import type { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventCalendarFeedSnapshot,
  TribeEventCalendarFeedSubscription,
  TribeEventCalendarFeedTokenOwner,
} from "@/src/modules/events/domain/entities/tribe-event-calendar-feed";
import type {
  TribeEventDateRange,
  TribeEventType,
} from "@/src/modules/events/domain/entities/tribe-event";

/**
 * Ports of the personal calendar feed. The token repository acts as the
 * signed-in member (it manages only their own token); the feed reader has no
 * session: it resolves the token and then reads as the token owner, so every
 * read repeats the owner's current access to the tribe.
 */

type FeedTokenFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;

export type TribeEventCalendarFeedTokenQuery = {
  tribeSlug: string;
};

export type IssueTribeEventCalendarFeedTokenCommand = TribeEventCalendarFeedTokenQuery & {
  /** SHA-256 hex digest of the new token; the plain token never reaches SQL. */
  tokenHash: string;
};

export type TribeEventCalendarFeedSubscriptionLookup =
  | {
      status: typeof TRIBE_EVENT_MUTATION_STATUS.found;
      subscription: TribeEventCalendarFeedSubscription | null;
    }
  | { status: FeedTokenFailureStatus };

export type TribeEventCalendarFeedTokenIssueResult =
  | {
      status: typeof TRIBE_EVENT_MUTATION_STATUS.feedTokenIssued;
      subscription: TribeEventCalendarFeedSubscription;
    }
  | { status: FeedTokenFailureStatus };

/**
 * Revoking is idempotent: no active token is still `feedTokenRevoked`.
 */
export type TribeEventCalendarFeedTokenRevokeResult = {
  status:
    | typeof TRIBE_EVENT_MUTATION_STATUS.feedTokenRevoked
    | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;
};

export type TribeEventCalendarFeedTokenRepository = {
  findActive: (
    query: TribeEventCalendarFeedTokenQuery
  ) => Promise<TribeEventCalendarFeedSubscriptionLookup>;
  /**
   * Revokes the active token of the member for the tribe (if any) and stores
   * the new one in the same transaction, serialized per member and tribe.
   */
  issue: (
    command: IssueTribeEventCalendarFeedTokenCommand
  ) => Promise<TribeEventCalendarFeedTokenIssueResult>;
  /**
   * Revokes the active token of the member for the tribe (if any), serialized
   * with `issue` per member and tribe.
   */
  revoke: (
    command: TribeEventCalendarFeedTokenQuery
  ) => Promise<TribeEventCalendarFeedTokenRevokeResult>;
};

export type ReadTribeEventCalendarFeedQuery = TribeEventDateRange & {
  /**
   * Types to include (empty: every type). Applied before `maxSeries`, so the
   * row limit never hides matching series behind unrequested ones.
   */
  eventTypes: readonly TribeEventType[];
  /** `last_used_at` is refreshed only when older than this many minutes. */
  lastUsedRefreshMinutes: number;
  /**
   * Budget of exceptions read. A series is returned only with its complete
   * exception set; a series whose set does not fit the remaining budget is
   * left out of the snapshot instead of being returned with part of it.
   */
  maxExceptions: number;
  maxSeries: number;
  owner: TribeEventCalendarFeedTokenOwner;
  tribeSlug: string;
};

export type TribeEventCalendarFeedReader = {
  /**
   * Reads the tribe calendar acting as the token owner. Null when the token
   * no longer belongs to that tribe, was revoked meanwhile, or the owner can
   * no longer read the tribe (left it or was blocked).
   */
  readAsOwner: (
    query: ReadTribeEventCalendarFeedQuery
  ) => Promise<TribeEventCalendarFeedSnapshot | null>;
  /** Active token with that hash, or null (unknown or revoked). */
  resolveToken: (tokenHash: string) => Promise<TribeEventCalendarFeedTokenOwner | null>;
};

/**
 * Generation and hashing of feed tokens, kept behind a port so the use cases
 * stay free of crypto APIs.
 */
export type TribeEventCalendarFeedTokenCodec = {
  generate: () => { token: string; tokenHash: string };
  hash: (token: string) => string;
  /** Constant-time comparison of two hex digests. */
  matchesHash: (candidateHash: string, storedHash: string) => boolean;
};
