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
import { buildTribeEventOccurrenceKey } from "@/src/modules/events/application/services/tribe-event-occurrences";
import { isValidTribeEventId } from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import {
  TRIBE_EVENT_ATTENDANCE_OPTIONS,
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_ATTENDANCE_STREAK,
  TRIBE_EVENT_ATTENDANCE_TREND,
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventAttendanceOption,
  TribeEventAttendee,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TribeEventAttendanceKey,
  TribeEventRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import {
  calculateTribeEventAttendanceStreak,
  selectRecentPastOccurrences,
} from "@/src/modules/events/domain/services/tribe-event-attendance";
import {
  expandTribeEventOccurrences,
  findTribeEventOccurrence,
} from "@/src/modules/events/domain/services/tribe-event-recurrence";

type TribeEventAttendanceDependencies = {
  tribeEventRepository: TribeEventRepository;
};

type ResolvedAttendanceKey =
  | {
      event: TribeEvent;
      key: TribeEventAttendanceKey;
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
const ATTENDANCE_OPTIONS: ReadonlySet<string> = new Set(TRIBE_EVENT_ATTENDANCE_OPTIONS);
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Validates the identifiers and proves the occurrence is a real slot of the
 * series before touching attendance rows.
 */
async function resolveAttendanceKey(
  tribeEventRepository: TribeEventRepository,
  command: ClearTribeEventAttendanceCommand
): Promise<ResolvedAttendanceKey> {
  const eventId = command.eventId.trim();
  const tribeSlug = command.tribeSlug.trim();
  const occurrenceTime = Date.parse(command.occurrenceStartsAt.trim());

  if (!Number.isFinite(occurrenceTime)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance };
  }

  if (!isValidTribeEventId(eventId)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
  }

  const event = await tribeEventRepository.findById({ eventId, tribeSlug });

  if (!event) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
  }

  const occurrenceStartsAt = new Date(occurrenceTime).toISOString();

  if (!findTribeEventOccurrence(event, occurrenceStartsAt)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance };
  }

  return {
    event,
    key: { eventId, occurrenceStartsAt, tribeSlug },
    status: RESOLVED_KEY_STATUS.valid,
  };
}

/**
 * Schedule fields the occurrence was validated against. The repository sends
 * them with the write so the database refuses it if a manager changed the
 * schedule after this validation (it runs in an earlier transaction).
 */
function pickValidatedSchedule(event: TribeEvent): TribeEventSchedule {
  return {
    endsAt: event.endsAt,
    recurrenceFrequency: event.recurrenceFrequency,
    recurrenceUntil: event.recurrenceUntil,
    startsAt: event.startsAt,
  };
}

function isAttendanceOption(status: string): status is TribeEventAttendanceOption {
  return ATTENDANCE_OPTIONS.has(status);
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
 * Starts of the last finished occurrences of a series (oldest first), or an
 * empty list for single events, which have no trend.
 */
function listTrendOccurrenceStarts(event: TribeEvent, nowTime: number): string[] {
  if (event.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none) {
    return [];
  }

  const pastOccurrences = expandTribeEventOccurrences(
    event,
    createPastRange(nowTime, TRIBE_EVENT_ATTENDANCE_TREND.lookbackDays)
  );

  return selectRecentPastOccurrences(
    pastOccurrences,
    nowTime,
    TRIBE_EVENT_ATTENDANCE_TREND.size
  ).map((occurrence) => occurrence.startsAt);
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
 * Saves the viewer answer for an occurrence. Answers are accepted only until
 * the occurrence ends, but that boundary is decided by the database clock
 * inside the locked SQL function (`occurrenceEnded`), never by the application
 * host clock, which can drift ahead of PostgreSQL and reject valid answers.
 */
export function setTribeEventAttendance({
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
  return async (
    command: SetTribeEventAttendanceCommand
  ): Promise<TribeEventAttendanceMutationResult> => {
    const status = command.status.trim();

    // `waitlisted` is never requested: the database assigns it when a
    // "going" answer finds the occurrence full.
    if (!isAttendanceOption(status)) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance };
    }

    const resolvedKey = await resolveAttendanceKey(tribeEventRepository, command);

    if (resolvedKey.status !== RESOLVED_KEY_STATUS.valid) {
      return { status: resolvedKey.status };
    }

    return tribeEventRepository.setAttendance({
      ...resolvedKey.key,
      schedule: pickValidatedSchedule(resolvedKey.event),
      status,
    });
  };
}

/**
 * Removes the viewer answer of an occurrence. Like saving an answer, the
 * database rejects it (`occurrenceEnded`) once the occurrence ended, so past
 * attendance stays frozen without trusting the application clock.
 */
export function clearTribeEventAttendance({
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
  return async (
    command: ClearTribeEventAttendanceCommand
  ): Promise<TribeEventAttendanceMutationResult> => {
    const resolvedKey = await resolveAttendanceKey(tribeEventRepository, command);

    if (resolvedKey.status !== RESOLVED_KEY_STATUS.valid) {
      return { status: resolvedKey.status };
    }

    return tribeEventRepository.clearAttendance({
      ...resolvedKey.key,
      schedule: pickValidatedSchedule(resolvedKey.event),
    });
  };
}

/**
 * Manager-only attendance of one occurrence: answers grouped by status and,
 * for series, the "going" totals of the last finished occurrences. The
 * repository enforces `can_manage_tribe_events`; members get `forbidden`.
 */
export function getTribeEventAttendanceReport({
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
  return async (
    query: GetTribeEventAttendanceReportQuery
  ): Promise<TribeEventAttendanceReportLookupResult> => {
    const resolvedKey = await resolveAttendanceKey(tribeEventRepository, query);

    if (resolvedKey.status !== RESOLVED_KEY_STATUS.valid) {
      return { status: resolvedKey.status };
    }

    const trendOccurrenceStartsAts = listTrendOccurrenceStarts(
      resolvedKey.event,
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
    const occurrences = history.events.flatMap((event) =>
      expandTribeEventOccurrences(event, range).map((occurrence) => ({
        ...occurrence,
        viewerStatus:
          viewerStatusByKey.get(buildTribeEventOccurrenceKey(event.id, occurrence.startsAt)) ??
          null,
      }))
    );

    return calculateTribeEventAttendanceStreak(occurrences, nowTime, {
      minimumAttended: TRIBE_EVENT_ATTENDANCE_STREAK.minimumAttended,
      windowSize: TRIBE_EVENT_ATTENDANCE_STREAK.windowSize,
    });
  };
}
