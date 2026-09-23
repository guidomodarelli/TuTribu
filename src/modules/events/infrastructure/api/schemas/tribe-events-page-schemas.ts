import { z } from "zod";

import {
  tribeEventMonthSchema,
  tribeEventOccurrenceKeySchema,
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

export const tribeEventsPageSearchParamsSchema = z.object({
  event: firstQueryValueSchema
    .pipe(tribeEventOccurrenceKeySchema)
    .optional()
    .catch(undefined),
  month: firstQueryValueSchema.pipe(tribeEventMonthSchema).optional().catch(undefined),
});
