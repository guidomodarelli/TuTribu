import type {
  CreateTribeEventCommand,
  DeleteTribeEventCommand,
  GetTribeEventQuery,
  ListTribeEventsQuery,
  UpdateTribeEventCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventCalendarResult,
  TribeEventDeleteResult,
  TribeEventListResult,
  TribeEventOccurrenceResult,
  TribeEventResult,
  TribeEventSaveResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  MONTH_OFFSET,
  addMonths,
  createBuenosAiresMonthRange,
  parseMonth,
  resolveBuenosAiresMonthOf,
  resolveCurrentBuenosAiresMonth,
} from "@/src/modules/events/application/services/buenos-aires-month";
import { buildTribeEventCalendarResult } from "@/src/modules/events/application/services/tribe-event-calendar-export";
import {
  NORMALIZED_EVENT_STATUS,
  listVisibleMonthOccurrences,
  normalizeTribeEventFields,
} from "@/src/modules/events/application/services/tribe-event-field-rules";
import {
  buildTribeEventOccurrenceKey,
  buildTribeEventOccurrences,
  toTribeEventResult,
} from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_CAPACITY_UPDATE_KIND,
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import type {
  TribeEventCapacityUpdate,
  TribeEventRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";

type TribeEventDependencies = {
  tribeEventOccurrenceExceptionRepository: TribeEventOccurrenceExceptionRepository;
  tribeEventRepository: TribeEventRepository;
};

/**
 * Capacity change of an update: a capacity the body omitted keeps the stored
 * one (legacy bodies without the field must not remove the limit); a present
 * value, already validated at the route boundary, is written as is (null
 * removes the limit).
 *
 * @param capacity - Validated capacity of the update, undefined when omitted.
 * @returns The capacity change to persist.
 */
function resolveCapacityUpdate(capacity: number | null | undefined): TribeEventCapacityUpdate {
  return capacity === undefined
    ? { kind: TRIBE_EVENT_CAPACITY_UPDATE_KIND.unchanged }
    : { capacity, kind: TRIBE_EVENT_CAPACITY_UPDATE_KIND.set };
}

/**
 * Occurrences of a freshly created event inside the month the caller is
 * looking at. A new series has no exceptions nor answers yet, so they are
 * built from the saved row without another query.
 */
function buildCreatedEventOccurrences(
  event: TribeEvent,
  visibleMonth: string | null
): TribeEventOccurrenceResult[] {
  if (visibleMonth === null) {
    return [];
  }

  return buildTribeEventOccurrences([event], [], [], createBuenosAiresMonthRange(visibleMonth));
}

/**
 * Month to list for a query.
 *
 * A deep-linked occurrence whose date was moved is listed in the month where
 * it is shown now (its new start), even when the link carries an explicit
 * month: shared links keep the month of the moment they were copied, and the
 * stable occurrence key would not be found in that stale month. Otherwise the
 * explicit month wins, then the month of the deep-linked occurrence, then the
 * current Buenos Aires month.
 */
async function resolveListingMonth(
  query: ListTribeEventsQuery,
  exceptionRepository: TribeEventOccurrenceExceptionRepository
): Promise<string> {
  if (!query.occurrence) {
    return query.month ?? resolveCurrentBuenosAiresMonth();
  }

  const exception = await exceptionRepository.find({
    eventId: query.occurrence.eventId,
    originalStartsAt: query.occurrence.occurrenceStartsAt,
    tribeSlug: query.tribeSlug,
  });

  if (exception?.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved && exception.newStartsAt) {
    return resolveBuenosAiresMonthOf(new Date(exception.newStartsAt));
  }

  return query.month ?? resolveBuenosAiresMonthOf(new Date(query.occurrence.occurrenceStartsAt));
}

export function listTribeEvents({
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (query: ListTribeEventsQuery): Promise<TribeEventListResult> => {
    const current = await resolveListingMonth(query, tribeEventOccurrenceExceptionRepository);
    const currentParts = parseMonth(current);
    const range = createBuenosAiresMonthRange(current);
    const listing = await tribeEventRepository.listByTribeRange({
      ...range,
      tribeSlug: query.tribeSlug,
    });
    const allEvents = buildTribeEventOccurrences(
      listing.events,
      listing.attendances,
      listing.exceptions,
      range
    );
    const events =
      query.eventTypes.length === 0
        ? allEvents
        : allEvents.filter((occurrence) => query.eventTypes.includes(occurrence.eventType));
    const recordedKeys = new Set(
      listing.recordedOccurrences.map((recorded) =>
        buildTribeEventOccurrenceKey(
          recorded.eventId,
          new Date(recorded.originalStartsAt).toISOString()
        )
      )
    );
    const recordedOccurrenceKeys = events
      .filter((occurrence) => recordedKeys.has(occurrence.occurrenceKey))
      .map((occurrence) => occurrence.occurrenceKey);
    const selectedOccurrenceKey =
      query.occurrence &&
      events.some((occurrence) => occurrence.occurrenceKey === query.occurrence?.key)
        ? query.occurrence.key
        : null;

    return {
      events,
      month: {
        current,
        next: currentParts ? addMonths(currentParts, MONTH_OFFSET.next) : current,
        previous: currentParts
          ? addMonths(currentParts, MONTH_OFFSET.previous)
          : current,
      },
      pendingProposalCount: listing.pendingProposalCount,
      recordedOccurrenceKeys,
      selectedOccurrenceKey,
      viewerPermissions: listing.viewerPermissions,
    };
  };
}

export function getTribeEvent({ tribeEventRepository }: TribeEventDependencies) {
  return async (query: GetTribeEventQuery): Promise<TribeEventResult | null> => {
    const event = await tribeEventRepository.findById({
      eventId: query.eventId,
      tribeSlug: query.tribeSlug,
    });

    return event ? toTribeEventResult(event) : null;
  };
}

export function createTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (command: CreateTribeEventCommand): Promise<TribeEventSaveResult> => {
    const normalizedInput = normalizeTribeEventFields(command);

    if (normalizedInput.status !== NORMALIZED_EVENT_STATUS.valid) {
      return { status: normalizedInput.status };
    }

    const result = await tribeEventRepository.create({
      ...normalizedInput.input,
      tribeSlug: command.tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.created) {
      return { status: result.status };
    }

    return {
      event: toTribeEventResult(result.event),
      occurrences: buildCreatedEventOccurrences(result.event, command.visibleMonth),
      status: result.status,
    };
  };
}

/**
 * Edits the whole series. The visible-month occurrences are read again after
 * the update so cancelled and moved dates, and every answer, stay in place.
 */
export function updateTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (command: UpdateTribeEventCommand): Promise<TribeEventSaveResult> => {
    // An omitted capacity is only normalized as "no limit" to reuse the
    // field rules; `resolveCapacityUpdate` below keeps the stored one.
    const normalizedInput = normalizeTribeEventFields({
      ...command,
      capacity: command.capacity ?? null,
    });

    if (normalizedInput.status !== NORMALIZED_EVENT_STATUS.valid) {
      return { status: normalizedInput.status };
    }

    const result = await tribeEventRepository.update({
      ...normalizedInput.input,
      // The visible month is read below through `listEventOccurrences`, which
      // also brings the exceptions and dates moved into the month; it runs
      // after the update (and its waitlist refill) committed, so the
      // summaries already include the promotions.
      attendanceRange: null,
      capacity: resolveCapacityUpdate(command.capacity),
      eventId: command.eventId,
      tribeSlug: command.tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.updated) {
      return { status: result.status };
    }

    return {
      event: toTribeEventResult(result.event),
      occurrences: await listVisibleMonthOccurrences(tribeEventRepository, {
        eventId: command.eventId,
        tribeSlug: command.tribeSlug,
        visibleMonth: command.visibleMonth,
      }),
      status: result.status,
    };
  };
}

export function deleteTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (command: DeleteTribeEventCommand): Promise<TribeEventDeleteResult> =>
    tribeEventRepository.delete({
      eventId: command.eventId,
      tribeSlug: command.tribeSlug,
    });
}

/**
 * Series plus its cancelled and moved dates for the ICS export. Exceptions
 * whose original slot is no longer part of the series are left out.
 */
export function getTribeEventCalendar({
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (query: GetTribeEventQuery): Promise<TribeEventCalendarResult | null> => {
    const event = await tribeEventRepository.findById(query);

    if (!event) {
      return null;
    }

    const exceptions =
      event.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none
        ? []
        : await tribeEventOccurrenceExceptionRepository.listByEvent(query);

    return buildTribeEventCalendarResult(event, exceptions);
  };
}
