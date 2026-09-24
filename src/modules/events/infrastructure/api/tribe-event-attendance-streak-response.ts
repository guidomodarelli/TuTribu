import type { TribeEventAttendanceStreakResult } from "@/src/modules/events/application/results/tribe-event-result";
import {
  tribeEventAttendanceStreakMutationFragmentDtoSchema,
  type TribeEventAttendanceStreakMutationFragmentDto,
} from "@/src/modules/events/infrastructure/api/dto/tribe-event-attendance-streak-dto";

/**
 * Streak refresh attached to the responses of series mutations (POST, PATCH,
 * and DELETE). Creating an event that starts in the past, or editing or
 * deleting a past series, can change the viewer's last finished occurrences,
 * so the route returns the recomputed streak next to the mutation result and
 * the client updates the next event card without a full route refresh. A
 * mutation can also move the next instant at which the streak changes (for
 * example a running occurrence outside the visible month), so the route
 * returns that instant too and the calendar keeps watching the right end.
 */

const ATTENDANCE_STREAK_REFRESH_LOG = {
  failureMessage: "Failed to recompute tribe event attendance streak after mutation",
  failureReason: "unexpected_event_repository_error",
  nextRefreshFailureMessage:
    "Failed to recompute tribe event attendance streak next refresh after mutation",
} as const;

type AttendanceStreakRefreshLogger = {
  error: (input: {
    error?: unknown;
    message: string;
    metadata?: Record<string, unknown>;
  }) => void;
};

type AttendanceStreakQuery = {
  tribeSlug: string;
};

type AttendanceStreakRefreshInput = {
  eventId: string;
  getTribeEventAttendanceStreak: (
    query: AttendanceStreakQuery
  ) => Promise<TribeEventAttendanceStreakResult | null>;
  getTribeEventAttendanceStreakNextRefreshAt: (
    query: AttendanceStreakQuery
  ) => Promise<string | null>;
  logger: AttendanceStreakRefreshLogger;
  tribeSlug: string;
  viewerId: string;
};

/**
 * Response fragment with the recomputed streak and next refresh instant.
 * `attendanceStreak: null` means the viewer has no streak anymore and
 * `attendanceStreakNextRefreshAt: null` means nothing ends inside the upcoming
 * window; an omitted field could not be recomputed and the client keeps the
 * value it already has.
 */
export type AttendanceStreakResponseFragment = TribeEventAttendanceStreakMutationFragmentDto;

/**
 * Recomputes the viewer streak and its next refresh instant through the
 * existing use cases, bound to the same request modules (and request-scoped
 * database context) as the mutation. Each field goes through the public DTO
 * independently; a failure or an unusable value never fails the mutation: it
 * is logged with context and only that field is omitted from the response.
 *
 * @param input - Streak use cases, request logger, and safe identifiers.
 * @returns The fragment to spread into the mutation response body.
 */
export async function readAttendanceStreakResponseFragment({
  eventId,
  getTribeEventAttendanceStreak,
  getTribeEventAttendanceStreakNextRefreshAt,
  logger,
  tribeSlug,
  viewerId,
}: AttendanceStreakRefreshInput): Promise<AttendanceStreakResponseFragment> {
  const readFragmentField = async (
    readField: () => Promise<Record<string, unknown>>,
    failureMessage: string
  ): Promise<AttendanceStreakResponseFragment> => {
    try {
      return tribeEventAttendanceStreakMutationFragmentDtoSchema.parse(await readField());
    } catch (error) {
      logger.error({
        message: failureMessage,
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
  };
  const [streakFragment, nextRefreshFragment] = await Promise.all([
    readFragmentField(
      async () => ({ attendanceStreak: await getTribeEventAttendanceStreak({ tribeSlug }) }),
      ATTENDANCE_STREAK_REFRESH_LOG.failureMessage
    ),
    readFragmentField(
      async () => ({
        attendanceStreakNextRefreshAt: await getTribeEventAttendanceStreakNextRefreshAt({
          tribeSlug,
        }),
      }),
      ATTENDANCE_STREAK_REFRESH_LOG.nextRefreshFailureMessage
    ),
  ]);

  return { ...streakFragment, ...nextRefreshFragment };
}
