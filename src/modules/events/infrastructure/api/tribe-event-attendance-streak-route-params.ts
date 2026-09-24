import { z } from "zod";

import { normalizeTribeSlug } from "@/src/modules/tribes/domain/value-objects/tribe-slug";

/**
 * Route params of `GET /api/tribes/[slug]/events/attendance-streak`. Only a
 * canonical tribe slug (the shape `normalizeTribeSlug` produces) is accepted,
 * so malformed input is rejected at the boundary before any session or
 * database work.
 */
export const tribeEventAttendanceStreakRouteParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .refine((slug) => normalizeTribeSlug(slug) === slug),
});
