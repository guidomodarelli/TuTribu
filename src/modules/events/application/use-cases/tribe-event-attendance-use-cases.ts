import type {
  ClearTribeEventAttendanceCommand,
  GetTribeEventAttendanceReportQuery,
  SetTribeEventAttendanceCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceMutationResult,
  TribeEventAttendanceReportLookupResult,
  TribeEventAttendanceReportResult,
  TribeEventAttendeeResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { createPastTribeEventRange } from "@/src/modules/events/application/services/tribe-event-time-ranges";
import { pickValidatedTribeEventSchedule } from "@/src/modules/events/application/services/tribe-event-validated-schedule";
import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
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
import { selectRecentPastOccurrences } from "@/src/modules/events/domain/services/tribe-event-attendance";
import {
  expandTribeEventOccurrencesWithExceptions,
  resolveTribeEventOccurrenceByOriginalStart,
  type TribeEventResolvedOccurrence,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";

type TribeEventAttendanceDependencies = {
  tribeEventOccurrenceExceptionRepository: TribeEventOccurrenceExceptionRepository;
  tribeEventRepository: TribeEventRepository;
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
 * Occurrences that actually took place: cancelled dates never count for the
 * trend nor the streak (moved dates count at their new time).
 */
function isHeldOccurrence(occurrence: TribeEventResolvedOccurrence): boolean {
  return occurrence.exception?.kind !== TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled;
}

/**
 * Last finished occurrences of a series, oldest first by their effective
 * start, or an empty list for single events, which have no trend. Each one
 * keeps its original start (the attendance key) and its effective start (the
 * date it was held, which differs for moved dates).
 */
function listTrendOccurrences(
  event: TribeEvent,
  exceptions: readonly TribeEventOccurrenceException[],
  nowTime: number
): TribeEventResolvedOccurrence[] {
  if (event.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none) {
    return [];
  }

  const pastOccurrences = expandTribeEventOccurrencesWithExceptions(
    event,
    exceptions,
    createPastTribeEventRange(nowTime, TRIBE_EVENT_ATTENDANCE_TREND.lookbackDays)
  ).filter(isHeldOccurrence);

  return selectRecentPastOccurrences(
    pastOccurrences,
    nowTime,
    TRIBE_EVENT_ATTENDANCE_TREND.size
  );
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
 * start (a moved date keeps its answers). A cancelled date takes no answers
 * (a rule of the date, not of the clock). Answers are accepted only until the
 * occurrence ends, but that boundary is decided by the database clock inside
 * the locked SQL function (`occurrenceEnded`, at the effective end of a moved
 * date), never by the application host clock, which can drift ahead of
 * PostgreSQL and reject valid answers.
 */
export function setTribeEventAttendance({
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
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

    return tribeEventRepository.setAttendance({
      ...resolvedKey.key,
      schedule: pickValidatedTribeEventSchedule(resolvedKey.event),
      status: command.status,
    });
  };
}

/**
 * Removes the viewer answer of an occurrence. Like saving an answer, the
 * database rejects it (`occurrenceEnded`) once the occurrence ended, so past
 * attendance stays frozen without trusting the application clock.
 */
export function clearTribeEventAttendance({
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
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

    return tribeEventRepository.clearAttendance({
      ...resolvedKey.key,
      schedule: pickValidatedTribeEventSchedule(resolvedKey.event),
    });
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
    const trendOccurrences = listTrendOccurrences(resolvedKey.event, exceptions, Date.now());
    // Counts are stored under the original start; only the report shows the
    // effective start, so a moved date is labelled with the day it was held.
    const trendOccurrenceStartsAts = trendOccurrences.map(
      (occurrence) => occurrence.originalStartsAt
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
        occurrenceStartsAt: resolvedKey.occurrence.startsAt,
        originalOccurrenceStartsAt: resolvedKey.key.occurrenceStartsAt,
        trend: trendOccurrences.map((occurrence) => ({
          goingCount: goingCountByStart.get(occurrence.originalStartsAt) ?? 0,
          occurrenceStartsAt: occurrence.startsAt,
          originalOccurrenceStartsAt: occurrence.originalStartsAt,
        })),
      },
      status: TRIBE_EVENT_MUTATION_STATUS.found,
    };
  };
}
