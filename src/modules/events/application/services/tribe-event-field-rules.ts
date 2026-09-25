import type { TribeEventFieldsInput } from "@/src/modules/events/application/commands/tribe-event-command";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { createBuenosAiresMonthRange } from "@/src/modules/events/application/services/buenos-aires-month";
import { buildTribeEventOccurrences } from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type {
  PersistTribeEventCommand,
  TribeEventRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import {
  InvalidMeetingUrlError,
  normalizeExternalMeetingUrl,
} from "@/src/modules/shared/domain/value-objects/external-meeting-url";

/**
 * Business rules of the event fields shared by every flow that writes a
 * series (create, edit, and approving a member proposal), plus the helper
 * that answers a mutation with the fresh occurrences of the visible month.
 */

export const NORMALIZED_EVENT_STATUS = {
  valid: "valid",
} as const;

export type NormalizedTribeEventFields =
  | {
      input: Omit<PersistTribeEventCommand, "tribeSlug">;
      status: typeof NORMALIZED_EVENT_STATUS.valid;
    }
  | {
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidDate
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence;
    };

/**
 * The end, when present, must come after the start.
 */
export function isInvalidTribeEventDateRange(startsAt: string, endsAt: string | null): boolean {
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
 *
 * @param fields - Event fields from the input schema.
 * @returns The normalized fields or the failed rule.
 */
export function normalizeTribeEventFields(
  fields: TribeEventFieldsInput
): NormalizedTribeEventFields {
  if (isInvalidTribeEventDateRange(fields.startsAt, fields.endsAt)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidDate };
  }

  let meetingUrl: string | null;

  try {
    meetingUrl = normalizeExternalMeetingUrl(fields.meetingUrl);
  } catch (error) {
    if (error instanceof InvalidMeetingUrlError) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl };
    }

    throw error;
  }

  const recurrence = resolveRecurrenceUntil(fields);

  if (recurrence === null) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence };
  }

  return {
    input: {
      capacity: fields.capacity,
      description: fields.description,
      endsAt: fields.endsAt,
      eventType: fields.eventType,
      meetingUrl,
      recurrenceFrequency: fields.recurrenceFrequency,
      recurrenceUntil: recurrence.recurrenceUntil,
      startsAt: fields.startsAt,
      title: fields.title,
    },
    status: NORMALIZED_EVENT_STATUS.valid,
  };
}

/**
 * Occurrences of one series inside the month the caller is looking at, read
 * after the mutation committed so they carry the current exceptions and
 * attendance. The UI patches its state with them instead of reloading.
 *
 * @param tribeEventRepository - Events repository.
 * @param query - Series, tribe, and visible month (null: none requested).
 * @returns The occurrences of the month, or an empty list.
 */
export async function listVisibleMonthOccurrences(
  tribeEventRepository: TribeEventRepository,
  query: { eventId: string; tribeSlug: string; visibleMonth: string | null }
): Promise<TribeEventOccurrenceResult[]> {
  if (query.visibleMonth === null) {
    return [];
  }

  const range = createBuenosAiresMonthRange(query.visibleMonth);
  const listing = await tribeEventRepository.listEventOccurrences({
    ...range,
    eventId: query.eventId,
    tribeSlug: query.tribeSlug,
  });

  return listing.event
    ? buildTribeEventOccurrences([listing.event], listing.attendances, listing.exceptions, range)
    : [];
}
