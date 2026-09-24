import { z } from "zod";

/**
 * Public HTTP contract of the viewer attendance streak that the events route
 * handlers send to the browser. The route builds its body through this schema
 * (unknown keys are stripped, so only the allowlisted counts leave the server)
 * and the browser adapter `safeParse`s it before the UI uses the value. The
 * module infrastructure owns it because it is the transport contract of the
 * events route handlers; the file only depends on `zod`, so it stays safe to
 * import from the browser adapter.
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
