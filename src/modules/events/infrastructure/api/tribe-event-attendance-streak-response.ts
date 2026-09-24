import type { TribeEventAttendanceStreakResult } from "@/src/modules/events/application/results/tribe-event-result";

/**
 * Streak refresh attached to the responses of series mutations (PATCH and
 * DELETE). Editing or deleting a past series can change the viewer's last
 * finished occurrences, so the route returns the recomputed streak next to
 * the mutation result and the client updates the next event card without a
 * full route refresh.
 */

const ATTENDANCE_STREAK_REFRESH_LOG = {
  failureMessage: "Failed to recompute tribe event attendance streak after mutation",
  failureReason: "unexpected_event_repository_error",
} as const;

type AttendanceStreakRefreshLogger = {
  error: (input: {
    error?: unknown;
    message: string;
    metadata?: Record<string, unknown>;
  }) => void;
};

type AttendanceStreakRefreshInput = {
  eventId: string;
  getTribeEventAttendanceStreak: (query: {
    tribeSlug: string;
  }) => Promise<TribeEventAttendanceStreakResult | null>;
  logger: AttendanceStreakRefreshLogger;
  tribeSlug: string;
  viewerId: string;
};

/**
 * Response fragment with the recomputed streak. `attendanceStreak: null`
 * means the viewer has no streak anymore; an empty fragment means it could
 * not be recomputed and the client keeps the value it already shows.
 */
export type AttendanceStreakResponseFragment =
  | { attendanceStreak: TribeEventAttendanceStreakResult | null }
  | Record<never, never>;

/**
 * Recomputes the viewer streak through the existing use case, bound to the
 * same request modules (and request-scoped database context) as the
 * mutation. A failure never fails the mutation: it is logged with context and
 * the streak is omitted from the response.
 *
 * @param input - Streak use case, request logger, and safe identifiers.
 * @returns The fragment to spread into the mutation response body.
 */
export async function readAttendanceStreakResponseFragment({
  eventId,
  getTribeEventAttendanceStreak,
  logger,
  tribeSlug,
  viewerId,
}: AttendanceStreakRefreshInput): Promise<AttendanceStreakResponseFragment> {
  try {
    return { attendanceStreak: await getTribeEventAttendanceStreak({ tribeSlug }) };
  } catch (error) {
    logger.error({
      message: ATTENDANCE_STREAK_REFRESH_LOG.failureMessage,
      error,
      metadata: {
        eventId,
        reason: ATTENDANCE_STREAK_REFRESH_LOG.failureReason,
        slug: tribeSlug,
        viewerId,
      },
    });

    return {};
  }
}
