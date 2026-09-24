import { notFound } from "next/navigation";

import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import { TribeEventsUnavailable } from "@/components/events/tribe-events-unavailable";
import {
  tribeEventAttendanceStreakPropsSchema,
  tribeEventListResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import {
  tribeEventsPageParamsSchema,
  tribeEventsPageSearchParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-events-page-schemas";
import {
  logRejectedTribeEventPublicDto,
  parseTribeEventPublicDto,
} from "@/src/modules/events/infrastructure/api/tribe-event-public-response";
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
  const [rawParams, rawSearchParams] = await Promise.all([params, searchParams]);
  const pageParams = tribeEventsPageParamsSchema.safeParse(rawParams);

  if (!pageParams.success) {
    notFound();
  }

  const { slug } = pageParams.data;
  // A malformed `month` or `event` is dropped (the schema catches it), so the
  // page falls back to the current month with no detail open.
  const parsedQuery = tribeEventsPageSearchParamsSchema.safeParse(rawSearchParams ?? {});
  const pageQuery = parsedQuery.success ? parsedQuery.data : {};
  const { authenticatedMember, logger, modules } =
    await resolveVisibleTribePageAccess({
      operation: TRIBE_EVENTS_PAGE.operation,
      slug,
    });
  const logMetadata = { slug, viewerId: authenticatedMember.id };

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
        month: pageQuery.month ?? null,
        occurrence: pageQuery.event ?? null,
        tribeSlug: slug,
      })
      .catch((error: unknown) => {
        logger.error({
          message: TRIBE_EVENTS_PAGE.listFailureMessage,
          error,
          metadata: {
            ...logMetadata,
            month: pageQuery.month ?? null,
            reason: TRIBE_EVENTS_PAGE.listFailureReason,
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
            ...logMetadata,
            reason: TRIBE_EVENTS_PAGE.listFailureReason,
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

  // The listing and the streak cross the server -> client boundary as props,
  // so they are public DTOs: validate them like any JSON response.
  const listingDto = parseTribeEventPublicDto(tribeEventListResponseSchema, listing);

  if (!listingDto.isUsable) {
    logRejectedTribeEventPublicDto(logger, listingDto.issues, logMetadata);

    return <TribeEventsUnavailable tribeSlug={slug} />;
  }

  const streakDto = parseTribeEventPublicDto(tribeEventAttendanceStreakPropsSchema, {
    attendanceStreak: attendanceStreakSnapshot.attendanceStreak,
    attendanceStreakComputedAt: attendanceStreakSnapshot.computedAt,
    attendanceStreakNextRefreshAt: attendanceStreakSnapshot.nextRefreshAt,
  });

  if (!streakDto.isUsable) {
    logRejectedTribeEventPublicDto(logger, streakDto.issues, logMetadata);
  }

  // An unusable snapshot degrades like a failed read: no streak line, no
  // refresh timer, and the read instant as the snapshot instant.
  const streakProps = streakDto.isUsable
    ? streakDto.dto
    : {
        attendanceStreak: EMPTY_ATTENDANCE_STREAK_SNAPSHOT.attendanceStreak,
        attendanceStreakComputedAt: attendanceStreakReadTime.toISOString(),
        attendanceStreakNextRefreshAt: EMPTY_ATTENDANCE_STREAK_SNAPSHOT.nextRefreshAt,
      };

  return (
    <TribeEventsCalendar
      attendanceStreak={streakProps.attendanceStreak}
      attendanceStreakComputedAt={streakProps.attendanceStreakComputedAt}
      attendanceStreakNextRefreshAt={streakProps.attendanceStreakNextRefreshAt}
      events={listingDto.dto.events}
      initialOccurrenceKey={listingDto.dto.selectedOccurrenceKey}
      month={listingDto.dto.month}
      tribeSlug={slug}
      viewerPermissions={listingDto.dto.viewerPermissions}
    />
  );
}
