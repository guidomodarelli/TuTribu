import type {
  CreateTribeEventCommand,
  DeleteTribeEventCommand,
  GetTribeEventQuery,
  ListTribeEventsQuery,
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
  normalizeMonthQuery,
  parseMonth,
  resolveBuenosAiresMonthOf,
} from "@/src/modules/events/application/services/buenos-aires-month";
import {
  buildTribeEventOccurrences,
  parseTribeEventOccurrenceKey,
  toTribeEventResult,
  type TribeEventOccurrenceKeyParts,
} from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_CAPACITY_LIMIT,
  TRIBE_EVENT_FIELD_LIMIT,
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventDateRange,
  TribeEventRecurrenceFrequency,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  PersistTribeEventCommand,
  TribeEventOccurrenceAttendance,
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
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidCapacity
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidDate
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidInput
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence;
    };

const NORMALIZED_EVENT_STATUS = {
  valid: "valid",
} as const;
const RECURRENCE_FREQUENCIES: ReadonlySet<string> = new Set(
  Object.values(TRIBE_EVENT_RECURRENCE_FREQUENCY)
);
/**
 * Event ids are Postgres uuids; anything else is rejected before querying so a
 * malformed route param never turns into a cast error at the database.
 */
/**
 * Whole positive number as typed in the "Cupo máximo" field (no sign, no
 * decimals, no exponent), checked before `Number` can accept "1e3" or "2.0".
 */
const CAPACITY_PATTERN = /^\d+$/;
const INVALID_CAPACITY = Symbol("invalid-capacity");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTribeEventId(eventId: string): boolean {
  return UUID_PATTERN.test(eventId);
}

/**
 * Validates the deep-link query value: first value of a repeated param, a
 * well-formed key, and a uuid event id. Anything else is ignored.
 */
function normalizeOccurrenceKeyQuery(
  occurrenceKey: string | string[] | undefined
): (TribeEventOccurrenceKeyParts & { key: string }) | null {
  const occurrenceKeyValue = Array.isArray(occurrenceKey) ? occurrenceKey[0] : occurrenceKey;
  const parts = occurrenceKeyValue ? parseTribeEventOccurrenceKey(occurrenceKeyValue) : null;

  if (!occurrenceKeyValue || !parts || !isValidTribeEventId(parts.eventId)) {
    return null;
  }

  return { ...parts, key: occurrenceKeyValue };
}

function normalizeOptionalText(value: string): string | null {
  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

/**
 * Normalizes the raw capacity field: empty or missing means unlimited (null).
 *
 * @param rawCapacity - Untrusted form value.
 * @returns The capacity, null for unlimited, or `INVALID_CAPACITY`.
 */
function normalizeCapacity(
  rawCapacity: string | undefined
): number | null | typeof INVALID_CAPACITY {
  const capacityValue = rawCapacity?.trim() ?? "";

  if (capacityValue.length === 0) {
    return null;
  }

  if (!CAPACITY_PATTERN.test(capacityValue)) {
    return INVALID_CAPACITY;
  }

  const capacity = Number(capacityValue);

  return capacity >= TRIBE_EVENT_CAPACITY_LIMIT.min &&
    capacity <= TRIBE_EVENT_CAPACITY_LIMIT.max
    ? capacity
    : INVALID_CAPACITY;
}

function isInvalidDateRange(startsAt: string, endsAt: string | null): boolean {
  const startsAtTime = Date.parse(startsAt);

  if (!Number.isFinite(startsAtTime)) {
    return true;
  }

  if (!endsAt) {
    return false;
  }

  const endsAtTime = Date.parse(endsAt);

  return !Number.isFinite(endsAtTime) || endsAtTime <= startsAtTime;
}

function normalizeRecurrence(
  rawFrequency: string,
  rawUntil: string,
  startsAt: string
):
  | {
      recurrenceFrequency: TribeEventRecurrenceFrequency;
      recurrenceUntil: string | null;
    }
  | null {
  const frequency = rawFrequency.trim() || TRIBE_EVENT_RECURRENCE_FREQUENCY.none;

  if (!RECURRENCE_FREQUENCIES.has(frequency)) {
    return null;
  }

  const recurrenceFrequency = frequency as TribeEventRecurrenceFrequency;

  if (recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none) {
    return { recurrenceFrequency, recurrenceUntil: null };
  }

  const until = normalizeOptionalText(rawUntil);

  if (until === null) {
    return { recurrenceFrequency, recurrenceUntil: null };
  }

  const untilTime = Date.parse(until);

  if (!Number.isFinite(untilTime) || untilTime < Date.parse(startsAt)) {
    return null;
  }

  return {
    recurrenceFrequency,
    recurrenceUntil: new Date(untilTime).toISOString(),
  };
}

function normalizeEventInput(
  command: CreateTribeEventCommand
): NormalizedEventInput {
  const title = command.title.trim();
  const startsAt = command.startsAt.trim();
  const endsAt = normalizeOptionalText(command.endsAt);
  const description = normalizeOptionalText(command.description);

  if (
    title.length === 0 ||
    title.length > TRIBE_EVENT_FIELD_LIMIT.titleMaxLength ||
    startsAt.length === 0 ||
    (description !== null &&
      description.length > TRIBE_EVENT_FIELD_LIMIT.descriptionMaxLength)
  ) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidInput };
  }

  if (isInvalidDateRange(startsAt, endsAt)) {
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

  const capacity = normalizeCapacity(command.capacity);

  if (capacity === INVALID_CAPACITY) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidCapacity };
  }

  const normalizedStartsAt = new Date(startsAt).toISOString();
  const recurrence = normalizeRecurrence(
    command.recurrenceFrequency,
    command.recurrenceUntil,
    normalizedStartsAt
  );

  if (recurrence === null) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence };
  }

  return {
    input: {
      capacity,
      description,
      endsAt: endsAt === null ? null : new Date(endsAt).toISOString(),
      meetingUrl,
      recurrenceFrequency: recurrence.recurrenceFrequency,
      recurrenceUntil: recurrence.recurrenceUntil,
      startsAt: normalizedStartsAt,
      title,
      tribeSlug: command.tribeSlug.trim(),
    },
    status: NORMALIZED_EVENT_STATUS.valid,
  };
}

/**
 * Range of the month the caller is looking at, or null when the `month`
 * query is missing or malformed (the save then returns no occurrences).
 */
function resolveVisibleMonthRange(visibleMonth: string | undefined): TribeEventDateRange | null {
  const monthValue = visibleMonth?.trim() ?? "";

  return monthValue && parseMonth(monthValue) ? createBuenosAiresMonthRange(monthValue) : null;
}

/**
 * Occurrences of a freshly saved event inside the month the caller is
 * looking at, so the UI can patch its state without reloading the route.
 * `attendances` are the summaries persisted for that event in the range; a
 * new event has none, and an update reads them after the waitlist refill.
 */
function buildVisibleMonthOccurrences(
  event: TribeEvent,
  attendances: TribeEventOccurrenceAttendance[],
  visibleMonthRange: TribeEventDateRange | null
): TribeEventOccurrenceResult[] {
  return visibleMonthRange
    ? buildTribeEventOccurrences([event], attendances, visibleMonthRange)
    : [];
}

export function listTribeEvents({ tribeEventRepository }: TribeEventDependencies) {
  return async (query: ListTribeEventsQuery): Promise<TribeEventListResult> => {
    const deepLink = normalizeOccurrenceKeyQuery(query.occurrenceKey);
    const current = normalizeMonthQuery(
      query.month ||
        (deepLink
          ? resolveBuenosAiresMonthOf(new Date(deepLink.occurrenceStartsAt))
          : undefined)
    );
    const currentParts = parseMonth(current);
    const range = createBuenosAiresMonthRange(current);
    const listing = await tribeEventRepository.listByTribeRange({
      ...range,
      tribeSlug: query.tribeSlug.trim(),
    });
    const events = buildTribeEventOccurrences(
      listing.events,
      listing.attendances,
      range
    );
    const selectedOccurrenceKey =
      deepLink && events.some((occurrence) => occurrence.occurrenceKey === deepLink.key)
        ? deepLink.key
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
    const eventId = query.eventId.trim();

    if (!isValidTribeEventId(eventId)) {
      return null;
    }

    const event = await tribeEventRepository.findById({
      eventId,
      tribeSlug: query.tribeSlug.trim(),
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
      occurrences: buildVisibleMonthOccurrences(
        result.event,
        [],
        resolveVisibleMonthRange(command.visibleMonth)
      ),
      status: result.status,
    };
  };
}

export function updateTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (command: UpdateTribeEventCommand): Promise<TribeEventSaveResult> => {
    const eventId = command.eventId.trim();

    if (!isValidTribeEventId(eventId)) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
    }

    const normalizedInput = normalizeEventInput(command);

    if (normalizedInput.status !== NORMALIZED_EVENT_STATUS.valid) {
      return { status: normalizedInput.status };
    }

    const visibleMonthRange = resolveVisibleMonthRange(command.visibleMonth);
    const result = await tribeEventRepository.update({
      ...normalizedInput.input,
      attendanceRange: visibleMonthRange,
      eventId,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.updated) {
      return { status: result.status };
    }

    return {
      event: toTribeEventResult(result.event),
      occurrences: buildVisibleMonthOccurrences(
        result.event,
        result.attendances,
        visibleMonthRange
      ),
      status: result.status,
    };
  };
}

export function deleteTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (command: DeleteTribeEventCommand): Promise<TribeEventDeleteResult> => {
    const eventId = command.eventId.trim();

    if (!isValidTribeEventId(eventId)) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
    }

    return tribeEventRepository.delete({
      eventId,
      tribeSlug: command.tribeSlug.trim(),
    });
  };
}
