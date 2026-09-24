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
 * viewer has no streak to show. The route always sends
 * `attendanceStreakNextRefreshAt` next to the streak (both come from one
 * snapshot read); the field stays optional so a body without it keeps the
 * instant the client already watches.
 */
export const tribeEventAttendanceStreakResponseDtoSchema = z.object({
  attendanceStreak: tribeEventAttendanceStreakDtoSchema.nullable(),
  attendanceStreakNextRefreshAt: tribeEventAttendanceStreakNextRefreshAtDtoSchema.optional(),
});

/**
 * Streak fragment spread into the bodies of `POST`, `PATCH`, and `DELETE`
 * series mutations. Both fields are omitted when the snapshot read fails, and
 * a single field is omitted when its value breaks this contract; the client then applies neither field and reads the streak again once
 * every pending mutation settles.
 */
export const tribeEventAttendanceStreakMutationFragmentDtoSchema = z.object({
  attendanceStreak: tribeEventAttendanceStreakDtoSchema.nullable().optional(),
  attendanceStreakNextRefreshAt: tribeEventAttendanceStreakNextRefreshAtDtoSchema.optional(),
});

export type TribeEventAttendanceStreakMutationFragmentDto = z.infer<
  typeof tribeEventAttendanceStreakMutationFragmentDtoSchema
>;

export type TribeEventAttendanceStreakResponseDto = z.infer<
  typeof tribeEventAttendanceStreakResponseDtoSchema
>;
