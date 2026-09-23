import type {
  CreateTribeEventCommand,
  DeleteTribeEventCommand,
  GetTribeEventQuery,
  ListTribeEventsQuery,
  TribeEventFieldsInput,
  UpdateTribeEventCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
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
import {
  buildTribeEventOccurrences,
  toTribeEventResult,
} from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type {
  PersistTribeEventCommand,
  TribeEventRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import {
  InvalidMeetingUrlError,
  normalizeExternalMeetingUrl,
} from "@/src/modules/shared/domain/value-objects/external-meeting-url";

type TribeEventDependencies = {
  tribeEventRepository: TribeEventRepository;
};

type NormalizedEventInput =
  | {
      input: PersistTribeEventCommand;
      status: typeof NORMALIZED_EVENT_STATUS.valid;
    }
  | {
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidDate
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence;
    };

const NORMALIZED_EVENT_STATUS = {
  valid: "valid",
} as const;

/**
 * The end, when present, must come after the start.
 */
function isInvalidDateRange(startsAt: string, endsAt: string | null): boolean {
  return endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt);
}

/**
 * Single events never keep an "until" date; a series may end on or after its
 * first occurrence.
 */
function resolveRecurrenceUntil(
  fields: TribeEventFieldsInput
): { recurrenceUntil: string | null } | null {
  if (fields.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none) {
    return { recurrenceUntil: null };
  }

  if (
    fields.recurrenceUntil !== null &&
    Date.parse(fields.recurrenceUntil) < Date.parse(fields.startsAt)
  ) {
    return null;
  }

  return { recurrenceUntil: fields.recurrenceUntil };
}

/**
 * Applies the business rules the input schema cannot express: the relation
 * between the dates of the series and the meeting link invariant. Format,
 * presence, and ranges were already validated at the route boundary.
 */
function normalizeEventInput(command: CreateTribeEventCommand): NormalizedEventInput {
  if (isInvalidDateRange(command.startsAt, command.endsAt)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidDate };
  }

  let meetingUrl: string | null;

  try {
    meetingUrl = normalizeExternalMeetingUrl(command.meetingUrl);
  } catch (error) {
    if (error instanceof InvalidMeetingUrlError) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl };
    }

    throw error;
  }

  const recurrence = resolveRecurrenceUntil(command);

  if (recurrence === null) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence };
  }

  return {
    input: {
      capacity: command.capacity,
      description: command.description,
      endsAt: command.endsAt,
      meetingUrl,
      recurrenceFrequency: command.recurrenceFrequency,
      recurrenceUntil: recurrence.recurrenceUntil,
      startsAt: command.startsAt,
      title: command.title,
      tribeSlug: command.tribeSlug,
    },
    status: NORMALIZED_EVENT_STATUS.valid,
  };
}

/**
 * Occurrences of a freshly saved event inside the month the caller is
 * looking at, so the UI can patch its state without reloading the route.
 */
function buildVisibleMonthOccurrences(
  event: TribeEvent,
  visibleMonth: string | null
): TribeEventOccurrenceResult[] {
  if (visibleMonth === null) {
    return [];
  }

  return buildTribeEventOccurrences(
    [event],
    [],
    createBuenosAiresMonthRange(visibleMonth)
  );
}

/**
 * Month to list: the explicit one, else the month of the deep-linked
 * occurrence, else the current Buenos Aires month.
 */
function resolveListingMonth(query: ListTribeEventsQuery): string {
  if (query.month !== null) {
    return query.month;
  }

  return query.occurrence
    ? resolveBuenosAiresMonthOf(new Date(query.occurrence.occurrenceStartsAt))
    : resolveCurrentBuenosAiresMonth();
}

export function listTribeEvents({ tribeEventRepository }: TribeEventDependencies) {
  return async (query: ListTribeEventsQuery): Promise<TribeEventListResult> => {
    const current = resolveListingMonth(query);
    const currentParts = parseMonth(current);
    const range = createBuenosAiresMonthRange(current);
    const listing = await tribeEventRepository.listByTribeRange({
      ...range,
      tribeSlug: query.tribeSlug,
    });
    const events = buildTribeEventOccurrences(
      listing.events,
      listing.attendances,
      range
    );
    const selectedOccurrenceKey =
      query.occurrence &&
      events.some((occurrence) => occurrence.occurrenceKey === query.occurrence?.key)
        ? query.occurrence.key
        : null;

    return {
      events,
      selectedOccurrenceKey,
      month: {
        current,
        next: currentParts ? addMonths(currentParts, MONTH_OFFSET.next) : current,
        previous: currentParts
          ? addMonths(currentParts, MONTH_OFFSET.previous)
          : current,
      },
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
    const normalizedInput = normalizeEventInput(command);

    if (normalizedInput.status !== NORMALIZED_EVENT_STATUS.valid) {
      return { status: normalizedInput.status };
    }

    const result = await tribeEventRepository.create(normalizedInput.input);

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.created) {
      return { status: result.status };
    }

    return {
      event: toTribeEventResult(result.event),
      occurrences: buildVisibleMonthOccurrences(result.event, command.visibleMonth),
      status: result.status,
    };
  };
}

export function updateTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (command: UpdateTribeEventCommand): Promise<TribeEventSaveResult> => {
    const normalizedInput = normalizeEventInput(command);

    if (normalizedInput.status !== NORMALIZED_EVENT_STATUS.valid) {
      return { status: normalizedInput.status };
    }

    const result = await tribeEventRepository.update({
      ...normalizedInput.input,
      eventId: command.eventId,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.updated) {
      return { status: result.status };
    }

    return {
      event: toTribeEventResult(result.event),
      occurrences: buildVisibleMonthOccurrences(result.event, command.visibleMonth),
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
