import type {
  GetTribeEventCalendarFeedQuery,
  TribeEventCalendarFeedTokenCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventCalendarFeedResult,
  TribeEventCalendarFeedSeriesResult,
  TribeEventCalendarFeedSubscriptionLookupResult,
  TribeEventCalendarFeedTokenIssueResult,
  TribeEventCalendarFeedTokenRevokeResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { buildTribeEventCalendarResult } from "@/src/modules/events/application/services/tribe-event-calendar-export";
import {
  TRIBE_EVENT_CALENDAR_FEED_MISS_REASON,
  TRIBE_EVENT_CALENDAR_FEED_REFRESH,
  TRIBE_EVENT_CALENDAR_FEED_WINDOW,
} from "@/src/modules/events/constants/tribe-event-calendar-feed";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventOccurrenceException } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventCalendarFeedSnapshot } from "@/src/modules/events/domain/entities/tribe-event-calendar-feed";
import type {
  TribeEventCalendarFeedReader,
  TribeEventCalendarFeedTokenCodec,
  TribeEventCalendarFeedTokenRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-calendar-feed-repository";

const MILLISECONDS_PER_DAY = 86_400_000;

type TokenManagementDependencies = {
  tribeEventCalendarFeedTokenRepository: TribeEventCalendarFeedTokenRepository;
};

type TokenIssueDependencies = TokenManagementDependencies & {
  tribeEventCalendarFeedTokenCodec: TribeEventCalendarFeedTokenCodec;
};

type CalendarFeedDependencies = {
  /** Clock of the feed window (injectable for tests). */
  now?: () => Date;
  tribeEventCalendarFeedReader: TribeEventCalendarFeedReader;
  tribeEventCalendarFeedTokenCodec: TribeEventCalendarFeedTokenCodec;
};

/**
 * Whether the signed-in member already has an active feed token.
 */
export function getTribeEventCalendarFeedSubscription({
  tribeEventCalendarFeedTokenRepository,
}: TokenManagementDependencies) {
  return (
    command: TribeEventCalendarFeedTokenCommand
  ): Promise<TribeEventCalendarFeedSubscriptionLookupResult> =>
    tribeEventCalendarFeedTokenRepository.findActive(command);
}

/**
 * Generates (or regenerates) the member's personal token. Only its hash is
 * stored; the previous token of the same member and tribe is revoked in the
 * same transaction. The plain token is returned once, to be shown once.
 */
export function issueTribeEventCalendarFeedToken({
  tribeEventCalendarFeedTokenCodec,
  tribeEventCalendarFeedTokenRepository,
}: TokenIssueDependencies) {
  return async (
    command: TribeEventCalendarFeedTokenCommand
  ): Promise<TribeEventCalendarFeedTokenIssueResult> => {
    const { token, tokenHash } = tribeEventCalendarFeedTokenCodec.generate();
    const result = await tribeEventCalendarFeedTokenRepository.issue({
      tokenHash,
      tribeSlug: command.tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.feedTokenIssued) {
      return { status: result.status };
    }

    return { status: result.status, subscription: result.subscription, token };
  };
}

/**
 * Turns the subscription off. Idempotent: without an active token it still
 * reports the token as revoked.
 */
export function revokeTribeEventCalendarFeedToken({
  tribeEventCalendarFeedTokenRepository,
}: TokenManagementDependencies) {
  return (
    command: TribeEventCalendarFeedTokenCommand
  ): Promise<TribeEventCalendarFeedTokenRevokeResult> =>
    tribeEventCalendarFeedTokenRepository.revoke(command);
}

function groupExceptionsByEvent(
  exceptions: readonly TribeEventOccurrenceException[]
): Map<string, TribeEventOccurrenceException[]> {
  const exceptionsByEvent = new Map<string, TribeEventOccurrenceException[]>();

  for (const exception of exceptions) {
    exceptionsByEvent.set(exception.eventId, [
      ...(exceptionsByEvent.get(exception.eventId) ?? []),
      exception,
    ]);
  }

  return exceptionsByEvent;
}

/**
 * Series of the snapshot (already filtered by type by the reader) as calendar
 * results, bounded by the VEVENT budget (one per series plus one per moved
 * date). A series that does not fit the remaining budget is skipped, not a
 * reason to stop: later, smaller series may still fit.
 */
function buildFeedSeries(
  snapshot: TribeEventCalendarFeedSnapshot
): TribeEventCalendarFeedSeriesResult[] {
  const exceptionsByEvent = groupExceptionsByEvent(snapshot.exceptions);
  const feedSeries: TribeEventCalendarFeedSeriesResult[] = [];
  let remainingComponents: number = TRIBE_EVENT_CALENDAR_FEED_WINDOW.maxComponents;

  for (const { calendarSequence, event, updatedAt } of snapshot.series) {
    if (remainingComponents === 0) {
      break;
    }

    const calendar = buildTribeEventCalendarResult(event, exceptionsByEvent.get(event.id) ?? []);
    const movedCount = calendar.occurrenceExceptions.filter(
      (occurrence) => occurrence.exception.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved
    ).length;
    const componentCount = 1 + movedCount;

    if (componentCount > remainingComponents) {
      continue;
    }

    remainingComponents -= componentCount;
    feedSeries.push({ ...calendar, calendarSequence, lastModifiedAt: updatedAt });
  }

  return feedSeries;
}

/**
 * Public feed of a tribe calendar. The token is the credential: it is hashed,
 * resolved to its owner, confirmed with a constant-time comparison, and the
 * calendar is then read acting as that owner, so a member who left the tribe
 * or was blocked (or a revoked token) gets the same "not found" as a token
 * that never existed.
 */
export function getTribeEventCalendarFeed({
  now = () => new Date(),
  tribeEventCalendarFeedReader,
  tribeEventCalendarFeedTokenCodec,
}: CalendarFeedDependencies) {
  return async (query: GetTribeEventCalendarFeedQuery): Promise<TribeEventCalendarFeedResult> => {
    const tokenHash = tribeEventCalendarFeedTokenCodec.hash(query.token);
    const owner = await tribeEventCalendarFeedReader.resolveToken(tokenHash);

    if (!owner || !tribeEventCalendarFeedTokenCodec.matchesHash(tokenHash, owner.tokenHash)) {
      return {
        ownerUserId: null,
        reason: TRIBE_EVENT_CALENDAR_FEED_MISS_REASON.unknownToken,
        status: TRIBE_EVENT_MUTATION_STATUS.notFound,
      };
    }

    const nowTime = now().getTime();
    const snapshot = await tribeEventCalendarFeedReader.readAsOwner({
      eventTypes: query.eventTypes,
      lastUsedRefreshMinutes: TRIBE_EVENT_CALENDAR_FEED_REFRESH.lastUsedRefreshMinutes,
      maxExceptions: TRIBE_EVENT_CALENDAR_FEED_WINDOW.maxExceptions,
      maxSeries: TRIBE_EVENT_CALENDAR_FEED_WINDOW.maxComponents,
      owner,
      rangeEnd: new Date(
        nowTime + TRIBE_EVENT_CALENDAR_FEED_WINDOW.futureWindowDays * MILLISECONDS_PER_DAY
      ).toISOString(),
      rangeStart: new Date(
        nowTime - TRIBE_EVENT_CALENDAR_FEED_WINDOW.pastWindowDays * MILLISECONDS_PER_DAY
      ).toISOString(),
      tribeSlug: query.tribeSlug,
    });

    if (!snapshot) {
      return {
        ownerUserId: owner.userId,
        reason: TRIBE_EVENT_CALENDAR_FEED_MISS_REASON.accessRevoked,
        status: TRIBE_EVENT_MUTATION_STATUS.notFound,
      };
    }

    return {
      calendarName: snapshot.tribeName,
      ownerUserId: owner.userId,
      series: buildFeedSeries(snapshot),
      status: TRIBE_EVENT_MUTATION_STATUS.found,
    };
  };
}
