import { getBuenosAiresDateKey } from "@/lib/date-time/buenos-aires-format";
import { BUENOS_AIRES_UTC_OFFSET } from "@/src/constants/date-time";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

/**
 * Pure helpers that shape tribe event occurrences for the month grid and the
 * agenda. They take plain results and return new values, so the calendar
 * container stays a thin orchestrator and every rule is unit-testable.
 */

/**
 * One cell of the month grid. `dateKey` is the Buenos Aires `YYYY-MM-DD`.
 */
export type TribeEventsCalendarDay = {
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
};

/**
 * Occurrences that share a Buenos Aires day, in start order.
 */
export type TribeEventsAgendaDay = {
  dayEvents: TribeEventOccurrenceResult[];
  dayKey: string;
};

export const CALENDAR_WEEK_LENGTH = 7;

const CALENDAR = {
  dateInputLength: 10,
  firstCalendarDay: 1,
  firstMonthDayTime: "-01T00:00:00",
  millisecondsPerDay: 86_400_000,
  monthIndexOffset: 1,
} as const;

/**
 * Builds the Monday-first cells of the month grid for a `YYYY-MM` month,
 * padding the first and last week with days of the neighbour months.
 *
 * @param month - Buenos Aires month key (`YYYY-MM`).
 * @returns Every cell of the grid, a multiple of seven.
 */
export function createCalendarDays(month: string): TribeEventsCalendarDay[] {
  const monthStart = new Date(month + CALENDAR.firstMonthDayTime + BUENOS_AIRES_UTC_OFFSET);
  const year = monthStart.getUTCFullYear();
  const monthIndex = monthStart.getUTCMonth();
  const daysInMonth = new Date(
    Date.UTC(year, monthIndex + CALENDAR.monthIndexOffset, 0)
  ).getUTCDate();
  const leadingDays =
    (monthStart.getUTCDay() + CALENDAR_WEEK_LENGTH - CALENDAR.firstCalendarDay) %
    CALENDAR_WEEK_LENGTH;
  const totalCells =
    Math.ceil((leadingDays + daysInMonth) / CALENDAR_WEEK_LENGTH) * CALENDAR_WEEK_LENGTH;
  const firstCellTime = monthStart.getTime() - leadingDays * CALENDAR.millisecondsPerDay;

  return Array.from({ length: totalCells }, (_, dayIndex) => {
    const date = new Date(firstCellTime + dayIndex * CALENDAR.millisecondsPerDay);

    return {
      dateKey: date.toISOString().slice(0, CALENDAR.dateInputLength),
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === monthIndex,
    };
  });
}

/**
 * Splits the grid cells into rows of seven days.
 *
 * @param calendarDays - Cells returned by {@link createCalendarDays}.
 * @returns One array per week.
 */
export function splitCalendarWeeks(
  calendarDays: TribeEventsCalendarDay[]
): TribeEventsCalendarDay[][] {
  return Array.from(
    { length: Math.ceil(calendarDays.length / CALENDAR_WEEK_LENGTH) },
    (_, weekIndex) =>
      calendarDays.slice(
        weekIndex * CALENDAR_WEEK_LENGTH,
        (weekIndex + 1) * CALENDAR_WEEK_LENGTH
      )
  );
}

/**
 * Orders two occurrences by their start instant (ISO strings sort lexically).
 */
export function compareOccurrencesByStart(
  firstOccurrence: TribeEventOccurrenceResult,
  secondOccurrence: TribeEventOccurrenceResult
): number {
  return firstOccurrence.startsAt.localeCompare(secondOccurrence.startsAt);
}

/**
 * Indexes occurrences by their Buenos Aires start day, keeping input order.
 *
 * @param occurrences - Occurrences already sorted by start.
 * @returns Map-like record from `YYYY-MM-DD` to that day's occurrences.
 */
export function groupOccurrencesByDay(
  occurrences: TribeEventOccurrenceResult[]
): Record<string, TribeEventOccurrenceResult[]> {
  const groupedOccurrences: Record<string, TribeEventOccurrenceResult[]> = {};

  for (const occurrence of occurrences) {
    const dayKey = getBuenosAiresDateKey(occurrence.startsAt);

    (groupedOccurrences[dayKey] ??= []).push(occurrence);
  }

  return groupedOccurrences;
}

/**
 * Groups occurrences into agenda days, preserving the order of first appearance.
 *
 * @param occurrences - Occurrences already sorted by start.
 * @returns Ordered agenda days.
 */
export function groupAgendaDays(
  occurrences: TribeEventOccurrenceResult[]
): TribeEventsAgendaDay[] {
  return Object.entries(groupOccurrencesByDay(occurrences)).map(([dayKey, dayEvents]) => ({
    dayEvents,
    dayKey,
  }));
}

/**
 * Replaces every occurrence of the saved event with the fresh set returned by
 * the endpoint. The server reads those occurrences after the mutation (with
 * their exceptions and attendance; an update reads them after refilling the
 * waitlists), so they win over the summaries on screen, which may show stale
 * waitlists. This only holds when the save was the lone pending mutation:
 * when it overlapped an attendance answer, nothing orders the two summaries,
 * so `useTribeEventMutations` reads the visible month again once both settle
 * (see `lib/events/tribe-event-occurrences-freshness.ts`).
 *
 * @param currentEvents - Occurrences currently on screen.
 * @param savedOccurrences - Occurrences of the saved event in the visible month.
 * @param eventId - Identifier of the saved series.
 * @returns The merged occurrences sorted by start.
 */
export function mergeSavedOccurrences(
  currentEvents: TribeEventOccurrenceResult[],
  savedOccurrences: TribeEventOccurrenceResult[],
  eventId: string
): TribeEventOccurrenceResult[] {
  return [
    ...currentEvents.filter((occurrence) => occurrence.eventId !== eventId),
    ...savedOccurrences,
  ].sort(compareOccurrencesByStart);
}
