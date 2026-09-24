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
 * Next instant (ISO 8601, UTC) at which the streak can change: the nearest
 * end of a running or upcoming occurrence of the tribe. `null` means nothing
 * ends inside the upcoming window.
 */
export const tribeEventAttendanceStreakNextRefreshAtDtoSchema = z.iso.datetime().nullable();

/**
 * Body of `GET /api/tribes/[slug]/events/attendance-streak`. `null` means the
 * viewer has no streak to show. `attendanceStreakNextRefreshAt` is omitted
 * when the route could not compute it, so the client keeps the instant it
 * already watches.
 */
export const tribeEventAttendanceStreakResponseDtoSchema = z.object({
  attendanceStreak: tribeEventAttendanceStreakDtoSchema.nullable(),
  attendanceStreakNextRefreshAt: tribeEventAttendanceStreakNextRefreshAtDtoSchema.optional(),
});

export type TribeEventAttendanceStreakResponseDto = z.infer<
  typeof tribeEventAttendanceStreakResponseDtoSchema
>;
