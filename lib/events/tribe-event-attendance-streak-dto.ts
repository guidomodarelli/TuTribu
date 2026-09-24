import { z } from "zod";

/**
 * Public contract of the viewer attendance streak that route handlers send
 * to the browser. The route builds its body through this schema (unknown
 * keys are stripped, so only the allowlisted counts leave the server) and
 * the browser adapter `safeParse`s it before the UI uses the value.
 */

/**
 * Allowlisted streak counts: non-negative integers only.
 */
export const tribeEventAttendanceStreakDtoSchema = z.object({
  attendedCount: z.number().int().nonnegative(),
  occurrenceCount: z.number().int().nonnegative(),
});

/**
 * Body of `GET /api/tribes/[slug]/events/attendance-streak`. `null` means the
 * viewer has no streak to show.
 */
export const tribeEventAttendanceStreakResponseDtoSchema = z.object({
  attendanceStreak: tribeEventAttendanceStreakDtoSchema.nullable(),
});

export type TribeEventAttendanceStreakResponseDto = z.infer<
  typeof tribeEventAttendanceStreakResponseDtoSchema
>;

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
