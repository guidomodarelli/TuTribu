import { z } from "zod";

import { tribeEventAttendanceStreakNextRefreshAtDtoSchema } from "@/src/modules/events/infrastructure/api/dto/tribe-event-attendance-streak-dto";

/**
 * Browser-side readers of the attendance streak snapshot and refresh instants. The public
 * response contract of the streak route lives in the events module
 * (`src/modules/events/infrastructure/api/dto/tribe-event-attendance-streak-dto.ts`).
 */

/**
 * Instant (ISO 8601, UTC) at which the server computed the streak it rendered.
 * The events page sends it next to the streak so the client can tell whether
 * an occurrence finished between that snapshot and its first clock value.
 */
export const tribeEventAttendanceStreakComputedAtDtoSchema = z.iso.datetime();

/**
 * Reads the server snapshot instant of the streak as epoch milliseconds.
 *
 * @param computedAt - Value received from the server render.
 * @returns Epoch milliseconds, or null when the value is missing or unusable.
 */
export function readAttendanceStreakComputedTime(computedAt: unknown): number | null {
  const parsedComputedAt = tribeEventAttendanceStreakComputedAtDtoSchema.safeParse(computedAt);

  return parsedComputedAt.success ? Date.parse(parsedComputedAt.data) : null;
}

/**
 * Reads the next instant at which the streak can change (the nearest end of
 * a running or upcoming occurrence of the tribe) as epoch milliseconds.
 *
 * @param nextRefreshAt - Value received from the server render or the streak
 *   route.
 * @returns Epoch milliseconds, or null when the value is missing or unusable.
 */
export function readAttendanceStreakNextRefreshTime(nextRefreshAt: unknown): number | null {
  const parsedNextRefreshAt =
    tribeEventAttendanceStreakNextRefreshAtDtoSchema.safeParse(nextRefreshAt);

  return parsedNextRefreshAt.success && parsedNextRefreshAt.data !== null
    ? Date.parse(parsedNextRefreshAt.data)
    : null;
}
