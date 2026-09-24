import { z } from "zod";

/**
 * Browser-side reader of the attendance streak snapshot instant. The public
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
