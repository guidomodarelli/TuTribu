import { z } from "zod";

import type { TribeEventType } from "@/src/modules/events/domain/entities/tribe-event";
import {
  dedupeEventTypes,
  splitEventTypeQueryValues,
  tribeEventMonthSchema,
  tribeEventOccurrenceKeySchema,
  tribeEventTypeSchema,
  tribeSlugParamSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-fields";

/**
 * Input contracts of the `/[slug]/eventos` page. Unlike the JSON endpoints, a
 * malformed query value is not an error for the page: it is dropped and the
 * page renders its default (current month, no detail open).
 */

export const tribeEventsPageParamsSchema = z.object({
  slug: tribeSlugParamSchema,
});

/**
 * Next.js hands repeated query params as arrays; the page only honors the
 * first value, like the links it builds.
 */
const firstQueryValueSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value[0] : value));

/**
 * Type filter of the page: every valid type of the repeated or
 * comma-separated `type` values, deduplicated. Unknown types are ignored
 * (the filter is a view preference, never an error for the page).
 */
const pageEventTypesSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    dedupeEventTypes(
      splitEventTypeQueryValues(value).flatMap((entry): TribeEventType[] => {
        const eventType = tribeEventTypeSchema.safeParse(entry);

        return eventType.success ? [eventType.data] : [];
      })
    )
  );

export const tribeEventsPageSearchParamsSchema = z.object({
  event: firstQueryValueSchema
    .pipe(tribeEventOccurrenceKeySchema)
    .optional()
    .catch(undefined),
  month: firstQueryValueSchema.pipe(tribeEventMonthSchema).optional().catch(undefined),
  type: pageEventTypesSchema.optional().catch(undefined),
});
