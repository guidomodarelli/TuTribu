import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import { TribeEventsUnavailable } from "@/components/events/tribe-events-unavailable";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const TRIBE_EVENTS_PAGE = {
  listFailureMessage: "Failed to list tribe events",
  listFailureReason: "unexpected_event_repository_error",
  operation: "tribe-events-page",
  streakFailureMessage: "Failed to compute tribe event attendance streak",
} as const;
/** Fallback when the streak read fails: no streak line and no refresh timer. */
const EMPTY_ATTENDANCE_STREAK_SNAPSHOT = {
  attendanceStreak: null,
  nextRefreshAt: null,
} as const;

export default async function TribeEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    event?: string | string[];
    month?: string | string[];
  }>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { authenticatedMember, logger, modules } =
    await resolveVisibleTribePageAccess({
      operation: TRIBE_EVENTS_PAGE.operation,
      slug,
    });

  // Application instant taken before the read: it only sizes the read
  // ranges. The streak, its next refresh, and `attendanceStreakComputedAt`
  // use the database instant of the single snapshot read, the clock that
  // attendance writes use to refuse ended occurrences. When the read fails,
  // this instant is the fallback `attendanceStreakComputedAt`.
  const attendanceStreakReadTime = new Date();

  // Failures are logged here, where the user-facing response is owned, and
  // degrade to a safe fallback instead of breaking the whole route. The
  // streak is optional: without it the page simply omits that line.
  // The next refresh instant covers occurrences outside the visible month
  // (for example one that started last month and is still running), whose
  // end would otherwise never refresh the streak on screen.
  const [listing, attendanceStreakSnapshot] = await Promise.all([
    modules.events.useCases
      .listTribeEvents({
        month: resolvedSearchParams?.month,
        occurrenceKey: resolvedSearchParams?.event,
        tribeSlug: slug,
      })
      .catch((error: unknown) => {
        logger.error({
          message: TRIBE_EVENTS_PAGE.listFailureMessage,
          error,
          metadata: {
            month: resolvedSearchParams?.month ?? null,
            reason: TRIBE_EVENTS_PAGE.listFailureReason,
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return null;
      }),
    modules.events.useCases
      .getTribeEventAttendanceStreakSnapshot({
        now: attendanceStreakReadTime,
        tribeSlug: slug,
      })
      .catch((error: unknown) => {
        logger.error({
          message: TRIBE_EVENTS_PAGE.streakFailureMessage,
          error,
          metadata: {
            reason: TRIBE_EVENTS_PAGE.listFailureReason,
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return {
          ...EMPTY_ATTENDANCE_STREAK_SNAPSHOT,
          computedAt: attendanceStreakReadTime.toISOString(),
        };
      }),
  ]);

  if (!listing) {
    return <TribeEventsUnavailable tribeSlug={slug} />;
  }

  return (
    <TribeEventsCalendar
      attendanceStreak={attendanceStreakSnapshot.attendanceStreak}
      attendanceStreakComputedAt={attendanceStreakSnapshot.computedAt}
      attendanceStreakNextRefreshAt={attendanceStreakSnapshot.nextRefreshAt}
      events={listing.events}
      initialOccurrenceKey={listing.selectedOccurrenceKey}
      month={listing.month}
      tribeSlug={slug}
      viewerPermissions={listing.viewerPermissions}
    />
  );
}
