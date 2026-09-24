import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import { TribeEventsUnavailable } from "@/components/events/tribe-events-unavailable";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const TRIBE_EVENTS_PAGE = {
  listFailureMessage: "Failed to list tribe events",
  listFailureReason: "unexpected_event_repository_error",
  operation: "tribe-events-page",
  streakFailureMessage: "Failed to compute tribe event attendance streak",
  streakNextRefreshFailureMessage:
    "Failed to compute tribe event attendance streak next refresh",
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

  // Taken before the streak read starts, so an occurrence that ends while the
  // query runs still falls after the snapshot and the client re-reads it.
  const attendanceStreakComputedAt = new Date().toISOString();

  // Failures are logged here, where the user-facing response is owned, and
  // degrade to a safe fallback instead of breaking the whole route. The
  // streak is optional: without it the page simply omits that line.
  // The next refresh instant covers occurrences outside the visible month
  // (for example one that started last month and is still running), whose
  // end would otherwise never refresh the streak on screen.
  const [listing, attendanceStreak, attendanceStreakNextRefreshAt] = await Promise.all([
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
      .getTribeEventAttendanceStreak({ tribeSlug: slug })
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

        return null;
      }),
    modules.events.useCases
      .getTribeEventAttendanceStreakNextRefreshAt({ tribeSlug: slug })
      .catch((error: unknown) => {
        logger.error({
          message: TRIBE_EVENTS_PAGE.streakNextRefreshFailureMessage,
          error,
          metadata: {
            reason: TRIBE_EVENTS_PAGE.listFailureReason,
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return null;
      }),
  ]);

  if (!listing) {
    return <TribeEventsUnavailable tribeSlug={slug} />;
  }

  return (
    <TribeEventsCalendar
      attendanceStreak={attendanceStreak}
      attendanceStreakComputedAt={attendanceStreakComputedAt}
      attendanceStreakNextRefreshAt={attendanceStreakNextRefreshAt}
      events={listing.events}
      initialOccurrenceKey={listing.selectedOccurrenceKey}
      month={listing.month}
      tribeSlug={slug}
      viewerPermissions={listing.viewerPermissions}
    />
  );
}
