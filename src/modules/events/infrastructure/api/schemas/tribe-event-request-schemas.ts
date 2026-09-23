import { z } from "zod";

import type {
  TribeEventAttendanceInput,
  TribeEventFieldsInput,
} from "@/src/modules/events/application/commands/tribe-event-command";
import {
  TRIBE_EVENT_ATTENDANCE_OPTIONS,
  TRIBE_EVENT_CAPACITY_LIMIT,
  TRIBE_EVENT_DEFAULT_TYPE,
  TRIBE_EVENT_FIELD_LIMIT,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import {
  createEventTypeFieldSchema,
  createOptionalTextFieldSchema,
  createTribeEventInstantSchema,
  dedupeEventTypes,
  splitEventTypeQueryValues,
  tribeEventIdParamSchema,
  tribeEventMonthSchema,
  tribeEventTypeSchema,
  tribeSlugParamSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-fields";
import { TRIBE_EVENT_INPUT_ISSUE } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-issue";

/**
 * Input contracts of `app/api/tribes/[slug]/events/**`: route params, query
 * strings, and JSON bodies. Every route validates each part once at its
 * boundary and hands the typed output to the use case.
 */

/**
 * Whole positive number as typed in the "Cupo máximo" field (no sign, no
 * decimals, no exponent), checked before `Number` can accept "1e3" or "2.0".
 */
const CAPACITY_PATTERN = /^\d+$/;

export const tribeEventsRouteParamsSchema = z.object({
  slug: tribeSlugParamSchema,
});

export const tribeEventRouteParamsSchema = z.object({
  eventId: tribeEventIdParamSchema,
  slug: tribeSlugParamSchema,
});

/**
 * `?month=` of the list, create, and update endpoints. Missing means "no
 * visible month" (the list falls back to the current Buenos Aires month).
 */
export const tribeEventMonthQuerySchema = z.object({
  month: tribeEventMonthSchema.optional(),
});

/**
 * `?month=` plus the optional type filter of `GET /events`: `type` may be
 * repeated or a comma-separated list. Unlike the page, the API rejects an
 * unknown type (400) instead of ignoring it. No type keeps every type.
 */
export const tribeEventListQuerySchema = z.object({
  month: tribeEventMonthSchema.optional(),
  type: z
    .union([z.string(), z.array(z.string())], {
      error: TRIBE_EVENT_INPUT_ISSUE.invalidEventType,
    })
    .transform(splitEventTypeQueryValues)
    .pipe(z.array(tribeEventTypeSchema))
    .transform(dedupeEventTypes)
    .optional(),
});

/**
 * `?occurrence=` of the attendance report, clear, and CSV export endpoints.
 */
export const tribeEventOccurrenceQuerySchema = z.object({
  occurrence: createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidAttendance),
});

/**
 * Endpoints that take no query parameters.
 */
export const tribeEventEmptyQuerySchema = z.object({});

const capacityValueSchema = z
  .string()
  .regex(CAPACITY_PATTERN, { error: TRIBE_EVENT_INPUT_ISSUE.invalidCapacity })
  .transform(Number)
  .pipe(
    z
      .int({ error: TRIBE_EVENT_INPUT_ISSUE.invalidCapacity })
      .min(TRIBE_EVENT_CAPACITY_LIMIT.min, { error: TRIBE_EVENT_INPUT_ISSUE.invalidCapacity })
      .max(TRIBE_EVENT_CAPACITY_LIMIT.max, { error: TRIBE_EVENT_INPUT_ISSUE.invalidCapacity })
  );

const recurrenceFrequencySchema = z
  .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidRecurrence })
  .trim()
  .nullish()
  .transform((frequency) => frequency || TRIBE_EVENT_RECURRENCE_FREQUENCY.none)
  .pipe(
    z.enum(TRIBE_EVENT_RECURRENCE_FREQUENCY, {
      error: TRIBE_EVENT_INPUT_ISSUE.invalidRecurrence,
    })
  );

/**
 * Body of the create (POST) and update (PATCH) endpoints. The form sends every
 * field as text; optional fields may be empty, null, or missing. Relations
 * between fields (end after start, "until" after start) and the meeting link
 * protocol are business rules checked by the use case and the domain.
 */
export const tribeEventMutationBodySchema = z.object(
  {
    capacity: createOptionalTextFieldSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidCapacity,
      capacityValueSchema
    ),
    description: createOptionalTextFieldSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidInput,
      z.string().max(TRIBE_EVENT_FIELD_LIMIT.descriptionMaxLength, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidInput,
      })
    ),
    endsAt: createOptionalTextFieldSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidDate,
      createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidDate)
    ),
    eventType: createEventTypeFieldSchema(TRIBE_EVENT_DEFAULT_TYPE),
    meetingUrl: createOptionalTextFieldSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidMeetingUrl,
      z.string()
    ),
    recurrenceFrequency: recurrenceFrequencySchema,
    recurrenceUntil: createOptionalTextFieldSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidRecurrence,
      createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidRecurrence)
    ),
    startsAt: z
      .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidInput })
      .trim()
      .min(1, { error: TRIBE_EVENT_INPUT_ISSUE.invalidInput })
      .pipe(createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidDate)),
    title: z
      .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidInput })
      .trim()
      .min(1, { error: TRIBE_EVENT_INPUT_ISSUE.invalidInput })
      .max(TRIBE_EVENT_FIELD_LIMIT.titleMaxLength, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidInput,
      }),
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidInput }
) satisfies z.ZodType<TribeEventFieldsInput>;

/**
 * Wire shape the browser sends to the create and update endpoints.
 */
export type TribeEventMutationRequestBody = z.input<typeof tribeEventMutationBodySchema>;

/**
 * Body of `PUT .../attendance`. Only the answers a member can pick are
 * accepted: `waitlisted` is assigned by the database, never requested.
 */
export const tribeEventAttendanceBodySchema = z.object(
  {
    occurrenceStartsAt: createTribeEventInstantSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidAttendance
    ),
    status: z.enum(TRIBE_EVENT_ATTENDANCE_OPTIONS, {
      error: TRIBE_EVENT_INPUT_ISSUE.invalidAttendance,
    }),
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidAttendance }
) satisfies z.ZodType<TribeEventAttendanceInput>;
