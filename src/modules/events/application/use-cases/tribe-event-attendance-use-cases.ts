import type {
  ClearTribeEventAttendanceCommand,
  GetTribeEventAttendanceReportQuery,
  GetTribeEventAttendanceStreakQuery,
  SetTribeEventAttendanceCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceMutationResult,
  TribeEventAttendanceReportLookupResult,
  TribeEventAttendanceReportResult,
  TribeEventAttendanceStreakResult,
  TribeEventAttendeeResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  buildTribeEventOccurrenceKey,
  groupTribeEventExceptionsByEvent,
} from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_ATTENDANCE_STREAK,
  TRIBE_EVENT_ATTENDANCE_TREND,
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventAttendee,
  TribeEventOccurrenceException,
} from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import type {
  TribeEventAttendanceKey,
  TribeEventRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import {
  calculateTribeEventAttendanceStreak,
  selectRecentPastOccurrences,
} from "@/src/modules/events/domain/services/tribe-event-attendance";
import { hasTribeEventOccurrenceEnded } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";
import {
  expandTribeEventOccurrencesWithExceptions,
  resolveTribeEventOccurrenceByOriginalStart,
  type TribeEventResolvedOccurrence,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";

type TribeEventAttendanceDependencies = {
  tribeEventOccurrenceExceptionRepository: TribeEventOccurrenceExceptionRepository;
  tribeEventRepository: TribeEventRepository;
};

type TribeEventAttendanceMutationDependencies = TribeEventAttendanceDependencies & {
  /**
   * Current time source (epoch ms), injectable for deterministic tests. Used
   * to reject answers once the occurrence ended; defaults to the system clock.
   */
  now?: () => number;
};

type ResolvedAttendanceKey =
  | {
      event: TribeEvent;
      key: TribeEventAttendanceKey;
      /** Effective occurrence: a moved date carries its new times. */
      occurrence: TribeEventResolvedOccurrence;
      status: typeof RESOLVED_KEY_STATUS.valid;
    }
  | {
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidAttendance
        | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;
    };

const RESOLVED_KEY_STATUS = {
  valid: "valid",
} as const;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Proves the occurrence is a real slot of the series before touching
 * attendance rows, and resolves its effective times through its exception
 * (moved or cancelled), since attendance keeps the original start as key.
 * Identifiers and the instant format were already validated at the route
 * boundary; this is the business rule a schema cannot express.
 */
async function resolveAttendanceKey(
  dependencies: TribeEventAttendanceDependencies,
  command: ClearTribeEventAttendanceCommand
): Promise<ResolvedAttendanceKey> {
  const { tribeEventOccurrenceExceptionRepository, tribeEventRepository } = dependencies;
  const { eventId, occurrenceStartsAt, tribeSlug } = command;
  const event = await tribeEventRepository.findById({ eventId, tribeSlug });

  if (!event) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
  }

  const exception = await tribeEventOccurrenceExceptionRepository.find({
    eventId,
    originalStartsAt: occurrenceStartsAt,
    tribeSlug,
  });
  const occurrence = resolveTribeEventOccurrenceByOriginalStart(
    event,
    exception ? [exception] : [],
    occurrenceStartsAt
  );

  if (!occurrence) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance };
  }

  return {
    event,
    key: { eventId, occurrenceStartsAt, tribeSlug },
    occurrence,
    status: RESOLVED_KEY_STATUS.valid,
  };
}

/**
 * Window `[now - lookbackDays, now)` used to look at finished occurrences.
 */
function createPastRange(nowTime: number, lookbackDays: number) {
  return {
    rangeEnd: new Date(nowTime).toISOString(),
    rangeStart: new Date(nowTime - lookbackDays * MILLISECONDS_PER_DAY).toISOString(),
  };
}

/**
 * Occurrences that actually took place: cancelled dates never count for the
 * trend nor the streak (moved dates count at their new time).
 */
function isHeldOccurrence(occurrence: TribeEventResolvedOccurrence): boolean {
  return occurrence.exception?.kind !== TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled;
}

/**
 * Original starts (the attendance key) of the last finished occurrences of a
 * series, oldest first, or an empty list for single events, which have no
 * trend.
 */
function listTrendOccurrenceStarts(
  event: TribeEvent,
  exceptions: readonly TribeEventOccurrenceException[],
  nowTime: number
): string[] {
  if (event.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none) {
    return [];
  }

  const pastOccurrences = expandTribeEventOccurrencesWithExceptions(
    event,
    exceptions,
    createPastRange(nowTime, TRIBE_EVENT_ATTENDANCE_TREND.lookbackDays)
  ).filter(isHeldOccurrence);

  return selectRecentPastOccurrences(
    pastOccurrences,
    nowTime,
    TRIBE_EVENT_ATTENDANCE_TREND.size
  ).map((occurrence) => occurrence.originalStartsAt);
}

function groupAttendees(
  attendees: TribeEventAttendee[]
): TribeEventAttendanceReportResult["attendeeGroups"] {
  const byStatus = (status: TribeEventAttendee["status"]): TribeEventAttendeeResult[] =>
    attendees.filter((attendee) => attendee.status === status);

  return {
    going: byStatus(TRIBE_EVENT_ATTENDANCE_STATUS.going),
    maybe: byStatus(TRIBE_EVENT_ATTENDANCE_STATUS.maybe),
    notGoing: byStatus(TRIBE_EVENT_ATTENDANCE_STATUS.notGoing),
    waitlisted: byStatus(TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted),
  };
}

/**
 * Records the viewer answer for one occurrence, identified by its original
 * start (a moved date keeps its answers). A cancelled date takes no answers,
 * and answers are accepted only until the occurrence ends: its effective end
 * (a moved date ends at its new time, see `getTribeEventOccurrenceEndTime`),
 * so finished occurrences cannot be rewritten through the API.
 */
export function setTribeEventAttendance({
  now = Date.now,
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventAttendanceMutationDependencies) {
  return async (
    command: SetTribeEventAttendanceCommand
  ): Promise<TribeEventAttendanceMutationResult> => {
    const resolvedKey = await resolveAttendanceKey(
      { tribeEventOccurrenceExceptionRepository, tribeEventRepository },
      command
    );

    if (resolvedKey.status !== RESOLVED_KEY_STATUS.valid) {
      return { status: resolvedKey.status };
    }

    if (
      resolvedKey.occurrence.exception?.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled
    ) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled };
    }

    if (hasTribeEventOccurrenceEnded(resolvedKey.occurrence, now())) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded };
    }

    return tribeEventRepository.setAttendance({
      ...resolvedKey.key,
      status: command.status,
    });
  };
}

/**
 * Removes the viewer answer of an occurrence. Like saving an answer, it is
 * rejected once the occurrence ended so past attendance stays frozen.
 */
export function clearTribeEventAttendance({
  now = Date.now,
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventAttendanceMutationDependencies) {
  return async (
    command: ClearTribeEventAttendanceCommand
  ): Promise<TribeEventAttendanceMutationResult> => {
    const resolvedKey = await resolveAttendanceKey(
      { tribeEventOccurrenceExceptionRepository, tribeEventRepository },
      command
    );

    if (resolvedKey.status !== RESOLVED_KEY_STATUS.valid) {
      return { status: resolvedKey.status };
    }

    if (hasTribeEventOccurrenceEnded(resolvedKey.occurrence, now())) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded };
    }

    return tribeEventRepository.clearAttendance(resolvedKey.key);
  };
}

/**
 * Manager-only attendance of one occurrence: answers grouped by status and,
 * for series, the "going" totals of the last finished occurrences. The
 * repository enforces `can_manage_tribe_events`; members get `forbidden`.
 */
export function getTribeEventAttendanceReport({
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
  return async (
    query: GetTribeEventAttendanceReportQuery
  ): Promise<TribeEventAttendanceReportLookupResult> => {
    const resolvedKey = await resolveAttendanceKey(
      { tribeEventOccurrenceExceptionRepository, tribeEventRepository },
      query
    );

    if (resolvedKey.status !== RESOLVED_KEY_STATUS.valid) {
      return { status: resolvedKey.status };
    }

    const exceptions =
      resolvedKey.event.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none
        ? []
        : await tribeEventOccurrenceExceptionRepository.listByEvent({
            eventId: query.eventId,
            tribeSlug: query.tribeSlug,
          });
    const trendOccurrenceStartsAts = listTrendOccurrenceStarts(
      resolvedKey.event,
      exceptions,
      Date.now()
    );
    const lookup = await tribeEventRepository.getOccurrenceAttendanceReport({
      ...resolvedKey.key,
      trendOccurrenceStartsAts,
    });

    if (lookup.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
      return { status: lookup.status };
    }

    const goingCountByStart = new Map(
      lookup.trend.map((point) => [
        new Date(point.occurrenceStartsAt).toISOString(),
        point.goingCount,
      ])
    );

    return {
      report: {
        attendeeGroups: groupAttendees(lookup.attendees),
        eventTitle: resolvedKey.event.title,
        occurrenceStartsAt: resolvedKey.key.occurrenceStartsAt,
        trend: trendOccurrenceStartsAts.map((occurrenceStartsAt) => ({
          goingCount: goingCountByStart.get(occurrenceStartsAt) ?? 0,
          occurrenceStartsAt,
        })),
      },
      status: TRIBE_EVENT_MUTATION_STATUS.found,
    };
  };
}

/**
 * Viewer-only streak over the last finished occurrences of the tribe, across
 * every series, looking back a bounded window.
 */
export function getTribeEventAttendanceStreak({
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
  return async (
    query: GetTribeEventAttendanceStreakQuery
  ): Promise<TribeEventAttendanceStreakResult | null> => {
    const nowTime = Date.now();
    const range = createPastRange(nowTime, TRIBE_EVENT_ATTENDANCE_STREAK.lookbackDays);
    const history = await tribeEventRepository.listViewerAttendanceHistory({
      ...range,
      tribeSlug: query.tribeSlug.trim(),
    });
    const viewerStatusByKey = new Map(
      history.viewerAttendances.map((attendance) => [
        buildTribeEventOccurrenceKey(
          attendance.eventId,
          new Date(attendance.occurrenceStartsAt).toISOString()
        ),
        attendance.status,
      ])
    );
    const exceptionsByEvent = groupTribeEventExceptionsByEvent(history.exceptions);
    const occurrences = history.events.flatMap((event) =>
      expandTribeEventOccurrencesWithExceptions(
        event,
        exceptionsByEvent.get(event.id) ?? [],
        range
      )
        .filter(isHeldOccurrence)
        .map((occurrence) => ({
          ...occurrence,
          viewerStatus:
            viewerStatusByKey.get(
              buildTribeEventOccurrenceKey(event.id, occurrence.originalStartsAt)
            ) ?? null,
        }))
    );

    return calculateTribeEventAttendanceStreak(occurrences, nowTime, {
      minimumAttended: TRIBE_EVENT_ATTENDANCE_STREAK.minimumAttended,
      windowSize: TRIBE_EVENT_ATTENDANCE_STREAK.windowSize,
    });
  };
}
