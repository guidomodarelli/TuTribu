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
  /**
   * Id of the subscription the client knows as active (null: it knows none).
   * The token is issued only while that is still the active one.
   */
  expectedSubscriptionId: string | null;
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
  | {
      status: FeedTokenFailureStatus | typeof TRIBE_EVENT_MUTATION_STATUS.feedTokenChanged;
    };

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
   * Optimistic precondition: when the active token is no longer
   * `expectedSubscriptionId` (another tab, a retry, or a revocation won the
   * race) nothing is revoked nor issued and it answers `feedTokenChanged`,
   * so only the credential of a successful response stays active.
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
  /** Types to include (empty: every type), applied before any budget. */
  eventTypes: readonly TribeEventType[];
  /** `last_used_at` is refreshed only when older than this many minutes. */
  lastUsedRefreshMinutes: number;
  /**
   * VEVENT budget: every returned series costs one component plus one per
   * valid moved date. Series are considered in feed order (most recent
   * first); one that does not fit the remaining budget is skipped and the
   * following ones are still considered.
   */
  maxComponents: number;
  /**
   * Budget of exceptions read. Only exceptions still valid for the current
   * schedule of their series count (stale ones are never returned). A series
   * is returned only with its complete valid set; one whose set does not fit
   * the remaining budget is skipped instead of being returned with part of it.
   */
  maxExceptions: number;
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
