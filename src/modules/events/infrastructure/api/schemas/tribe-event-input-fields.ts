import { z } from "zod";

import type { TribeEventOccurrenceReference } from "@/src/modules/events/application/commands/tribe-event-command";
import { parseMonth } from "@/src/modules/events/application/services/buenos-aires-month";
import { parseTribeEventOccurrenceKey } from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_TYPE,
  TRIBE_EVENT_TYPE_QUERY_SEPARATOR,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventType } from "@/src/modules/events/domain/entities/tribe-event";
import {
  TRIBE_EVENT_INPUT_ISSUE,
  type TribeEventInputIssue,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-issue";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";

/**
 * Field schemas shared by the event route and page boundaries. Each field
 * validates format only (types, presence, ranges, canonical forms); rules that
 * relate several fields or need persisted data stay in the use cases.
 */

/**
 * Tribe slug from the `[slug]` route segment, in its canonical form.
 */
export const tribeSlugParamSchema = z
  .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidTribeReference })
  .regex(TRIBE_SLUG_PATTERN, { error: TRIBE_EVENT_INPUT_ISSUE.invalidTribeReference });

/**
 * Event id from the `[eventId]` route segment. Events use Postgres uuids, so
 * anything else is rejected before it can become a cast error at the database.
 */
export const tribeEventIdParamSchema = z.guid({
  error: TRIBE_EVENT_INPUT_ISSUE.invalidEventReference,
});

/**
 * Proposal id from the `[proposalId]` route segment (Postgres uuid).
 */
export const tribeEventProposalIdParamSchema = z.guid({
  error: TRIBE_EVENT_INPUT_ISSUE.invalidProposalReference,
});

/**
 * One event type of the fixed catalog.
 */
export const tribeEventTypeSchema = z.enum(TRIBE_EVENT_TYPE, {
  error: TRIBE_EVENT_INPUT_ISSUE.invalidEventType,
});

/**
 * Optional event type of a form body: missing, null, or blank means the
 * default type (`fallbackType`).
 *
 * @param fallbackType - Type used when the field is empty.
 * @returns Schema whose output is a catalog type.
 */
export function createEventTypeFieldSchema(fallbackType: TribeEventType) {
  return z
    .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidEventType })
    .trim()
    .nullish()
    .transform((eventType) => eventType || fallbackType)
    .pipe(tribeEventTypeSchema);
}

/**
 * Splits the raw `type` query value(s): the parameter may be repeated
 * (`?type=live&type=qa`) or carry a comma-separated list (`?type=live,qa`).
 *
 * @param value - One value or the repeated values of the parameter.
 * @returns Every trimmed, non-empty entry.
 */
export function splitEventTypeQueryValues(value: string | string[]): string[] {
  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(TRIBE_EVENT_TYPE_QUERY_SEPARATOR))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Removes repeated types keeping the first appearance.
 */
export function dedupeEventTypes(eventTypes: readonly TribeEventType[]): TribeEventType[] {
  return [...new Set(eventTypes)];
}

/**
 * Visible calendar month (`YYYY-MM`, month between 01 and 12).
 */
export const tribeEventMonthSchema = z
  .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidMonth })
  .refine((month) => parseMonth(month) !== null, {
    error: TRIBE_EVENT_INPUT_ISSUE.invalidMonth,
  });

/**
 * ISO 8601 instant (with `Z` or an explicit offset), normalized to the
 * canonical UTC form produced by `Date.prototype.toISOString`.
 *
 * @param issue - Category reported when the value is not a valid instant.
 * @returns Schema whose output is the canonical instant.
 */
export function createTribeEventInstantSchema(issue: TribeEventInputIssue) {
  return z
    .string({ error: issue })
    .trim()
    .pipe(z.iso.datetime({ error: issue, offset: true }))
    .transform((instant) => new Date(instant).toISOString());
}

/**
 * Optional text field of a form body: missing, null, or blank values become
 * null; anything else is trimmed and handed to `valueSchema`.
 *
 * @param issue - Category reported for a value of the wrong type.
 * @param valueSchema - Schema applied to the trimmed, non-empty value.
 * @returns Schema whose output is the validated value or null.
 */
export function createOptionalTextFieldSchema<TOutput>(
  issue: TribeEventInputIssue,
  valueSchema: z.ZodType<TOutput, string>
) {
  return z
    .string({ error: issue })
    .trim()
    .nullish()
    .transform((value) => (value ? value : null))
    .pipe(valueSchema.nullable());
}

/**
 * Deep-link occurrence key (`eventId@startsAt`): a uuid event id and the
 * canonical ISO start, as built by `buildTribeEventOccurrenceKey`.
 */
export const tribeEventOccurrenceKeySchema = z
  .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidEventReference })
  .transform((occurrenceKey, context): TribeEventOccurrenceReference => {
    const occurrenceKeyParts = parseTribeEventOccurrenceKey(occurrenceKey);

    if (
      !occurrenceKeyParts ||
      !tribeEventIdParamSchema.safeParse(occurrenceKeyParts.eventId).success
    ) {
      context.addIssue(TRIBE_EVENT_INPUT_ISSUE.invalidEventReference);

      return z.NEVER;
    }

    return { ...occurrenceKeyParts, key: occurrenceKey };
  });
