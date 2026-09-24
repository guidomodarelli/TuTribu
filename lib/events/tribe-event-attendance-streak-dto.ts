import { tribeEventAttendanceStreakComputedAtSchema } from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";

/**
 * Browser-side reader of the streak snapshot instant the events page sends as
 * a prop. The contract itself lives with the other public DTO schemas in
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
