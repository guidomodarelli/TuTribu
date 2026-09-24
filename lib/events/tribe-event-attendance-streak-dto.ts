import {
  tribeEventAttendanceStreakComputedAtSchema,
  tribeEventAttendanceStreakNextRefreshAtSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";

/**
 * Browser-side readers of the attendance streak snapshot and refresh instants
 * the events page sends as props. The contracts themselves live with the
 * other public DTO schemas in
 * `application/results/tribe-event-public-dto-schemas.ts`.
 */

/**
 * Reads the server snapshot instant of the streak as epoch milliseconds.
 *
 * @param computedAt - Value received from the server render.
 * @returns Epoch milliseconds, or null when the value is missing or unusable.
 */
export function readAttendanceStreakComputedTime(computedAt: unknown): number | null {
  const parsedComputedAt = tribeEventAttendanceStreakComputedAtSchema.safeParse(computedAt);

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
    tribeEventAttendanceStreakNextRefreshAtSchema.safeParse(nextRefreshAt);

  return parsedNextRefreshAt.success && parsedNextRefreshAt.data !== null
    ? Date.parse(parsedNextRefreshAt.data)
    : null;
}
