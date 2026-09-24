import type { TribeEventAttendanceStreakSnapshotResult } from "@/src/modules/events/application/results/tribe-event-result";
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
  computedAtFailureMessage:
    "Failed to recompute tribe event attendance streak reference time after mutation",
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
  now: Date;
  tribeSlug: string;
};

type AttendanceStreakRefreshInput = {
  eventId: string;
  getTribeEventAttendanceStreakSnapshot: (
    query: AttendanceStreakQuery
  ) => Promise<TribeEventAttendanceStreakSnapshotResult>;
  logger: AttendanceStreakRefreshLogger;
  tribeSlug: string;
  viewerId: string;
};

/**
 * Response fragment with the recomputed streak and next refresh instant.
 * `attendanceStreak: null` means the viewer has no streak anymore and
 * `attendanceStreakNextRefreshAt: null` means nothing ends inside the upcoming
 * window; an omitted field could not be recomputed and the client reads the
 * streak again instead of applying the fragment.
 */
export type AttendanceStreakResponseFragment = TribeEventAttendanceStreakMutationFragmentDto;

/**
 * Recomputes the viewer streak, its next refresh instant, and the database
 * instant both were computed at (`attendanceStreakComputedAt`) through the
 * snapshot use case, bound to the same request modules (and request-scoped
 * database context) as the mutation. Both values come from one repository
 * read, answered from a single database snapshot at one reference instant, so
 * a series another manager creates or reschedules concurrently can never
 * appear in the streak and be missing from the deadline (or the other way
 * around).
 *
 * A failed read never fails the mutation: it is logged with context and both
 * fields are omitted. Each field then goes through the public DTO
 * independently, so an unusable value is logged and only that field is
 * omitted from the response.
 *
 * @param input - Streak snapshot use case, request logger, and safe identifiers.
 * @returns The fragment to spread into the mutation response body.
 */
export async function readAttendanceStreakResponseFragment({
  eventId,
  getTribeEventAttendanceStreakSnapshot,
  logger,
  tribeSlug,
  viewerId,
}: AttendanceStreakRefreshInput): Promise<AttendanceStreakResponseFragment> {
  const logFailure = (message: string, error: unknown) => {
    logger.error({
      message,
      error,
      metadata: {
        eventId,
        reason: ATTENDANCE_STREAK_REFRESH_LOG.failureReason,
        slug: tribeSlug,
        viewerId,
      },
    });
  };
  const parseFragmentField = (
    field: Record<string, unknown>,
    failureMessage: string
  ): AttendanceStreakResponseFragment => {
    const parsedField = tribeEventAttendanceStreakMutationFragmentDtoSchema.safeParse(field);

    if (!parsedField.success) {
      logFailure(failureMessage, parsedField.error);

      return {};
    }

    return parsedField.data;
  };
  let snapshot: TribeEventAttendanceStreakSnapshotResult;

  try {
    snapshot = await getTribeEventAttendanceStreakSnapshot({ now: new Date(), tribeSlug });
  } catch (error) {
    logFailure(ATTENDANCE_STREAK_REFRESH_LOG.failureMessage, error);

    return {};
  }

  return {
    ...parseFragmentField(
      { attendanceStreak: snapshot.attendanceStreak },
      ATTENDANCE_STREAK_REFRESH_LOG.failureMessage
    ),
    ...parseFragmentField(
      { attendanceStreakNextRefreshAt: snapshot.nextRefreshAt },
      ATTENDANCE_STREAK_REFRESH_LOG.nextRefreshFailureMessage
    ),
    ...parseFragmentField(
      { attendanceStreakComputedAt: snapshot.computedAt },
      ATTENDANCE_STREAK_REFRESH_LOG.computedAtFailureMessage
    ),
  };
}
