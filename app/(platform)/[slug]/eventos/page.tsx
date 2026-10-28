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
import { buildTribeEventsRoute } from "@/lib/events/tribe-events-routes";
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

type TribeEventsPageAccess = Awaited<ReturnType<typeof resolveVisibleTribePageAccess>>;

type AttendanceStreakRead = Pick<TribeEventsPageAccess, "logger" | "modules"> & {
  logMetadata: { slug: string; viewerId: string };
  readTime: Date;
  slug: string;
};

/**
 * Reads the attendance streak snapshot; a failure is logged and degrades to
 * no streak line and no refresh timer.
 */
async function loadAttendanceStreakSnapshot({ logger, logMetadata, modules, readTime, slug }: AttendanceStreakRead) {
  return modules.events.useCases
    .getTribeEventAttendanceStreakSnapshot({
      now: readTime,
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
        computedAt: readTime.toISOString(),
      };
    });
}

type TribeEventsListingRead = Pick<AttendanceStreakRead, "logMetadata" | "logger" | "modules" | "slug"> & {
  pageQuery: Partial<ReturnType<typeof tribeEventsPageSearchParamsSchema.parse>>;
};

/**
 * Lists every event type of the requested month (the type filter is applied
 * on the client, so chips toggle without a request); a failure is logged and
 * returns `null`.
 */
async function loadTribeEventsListing({ logger, logMetadata, modules, pageQuery, slug }: TribeEventsListingRead) {
  return modules.events.useCases
    .listTribeEvents({
      eventTypes: [],
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
    });
}

type AttendanceStreakPropsInput = Pick<AttendanceStreakRead, "logMetadata" | "logger" | "readTime"> & {
  snapshot: Awaited<ReturnType<typeof loadAttendanceStreakSnapshot>>;
};

/**
 * The streak crosses the server -> client boundary as props, so it is a
 * public DTO. An unusable snapshot degrades like a failed read: no streak
 * line, no refresh timer, and the read instant as the snapshot instant.
 */
function toAttendanceStreakProps({ logger, logMetadata, readTime, snapshot }: AttendanceStreakPropsInput) {
  const streakDto = parseTribeEventPublicDto(tribeEventAttendanceStreakPropsSchema, {
    attendanceStreak: snapshot.attendanceStreak,
    attendanceStreakComputedAt: snapshot.computedAt,
    attendanceStreakNextRefreshAt: snapshot.nextRefreshAt,
  });

  if (streakDto.isUsable) {
    return streakDto.dto;
  }

  logRejectedTribeEventPublicDto(logger, streakDto.issues, logMetadata);

  return {
    attendanceStreak: EMPTY_ATTENDANCE_STREAK_SNAPSHOT.attendanceStreak,
    attendanceStreakComputedAt: readTime.toISOString(),
    attendanceStreakNextRefreshAt: EMPTY_ATTENDANCE_STREAK_SNAPSHOT.nextRefreshAt,
  };
}

type TribeEventsPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    event?: string | string[];
    month?: string | string[];
    type?: string | string[];
  }>;
};

/**
 * Validated slug and query of the page; a malformed slug is a 404.
 */
async function readTribeEventsPageInput({ params, searchParams }: TribeEventsPageProps) {
  const [rawParams, rawSearchParams] = await Promise.all([params, searchParams]);
  const pageParams = tribeEventsPageParamsSchema.safeParse(rawParams);

  if (!pageParams.success) {
    notFound();
  }

  // A malformed `month` or `event` is dropped (the schema catches it), so the
  // page falls back to the current month with no detail open.
  const parsedQuery = tribeEventsPageSearchParamsSchema.safeParse(rawSearchParams ?? {});
  const pageQuery: TribeEventsListingRead["pageQuery"] = parsedQuery.success ? parsedQuery.data : {};

  return { pageQuery, slug: pageParams.data.slug };
}

/**
 * Kept out of the React Compiler, as before its loaders moved into helpers:
 * a server page renders once, so it has nothing to memoize.
 */
export default async function TribeEventsPage(props: TribeEventsPageProps) {
  "use no memo";

  const { pageQuery, slug } = await readTribeEventsPageInput(props);
  const { authenticatedMember, logger, modules } =
    await resolveVisibleTribePageAccess({
      // Keeps the validated deep link so sign-in reopens the same month and event.
      callbackPath: buildTribeEventsRoute(slug, {
        eventTypes: pageQuery.type,
        month: pageQuery.month,
        occurrenceKey: pageQuery.event?.key,
      }),
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
    loadTribeEventsListing({ logger, logMetadata, modules, pageQuery, slug }),
    loadAttendanceStreakSnapshot({ logger, logMetadata, modules, readTime: attendanceStreakReadTime, slug }),
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

  const streakProps = toAttendanceStreakProps({
    logger,
    logMetadata,
    readTime: attendanceStreakReadTime,
    snapshot: attendanceStreakSnapshot,
  });

  return (
    <TribeEventsCalendar
      attendanceStreak={streakProps.attendanceStreak}
      attendanceStreakComputedAt={streakProps.attendanceStreakComputedAt}
      attendanceStreakNextRefreshAt={streakProps.attendanceStreakNextRefreshAt}
      events={listingDto.dto.events}
      initialEventTypes={pageQuery.type ?? []}
      initialOccurrenceKey={listingDto.dto.selectedOccurrenceKey}
      month={listingDto.dto.month}
      pendingProposalCount={listingDto.dto.pendingProposalCount}
      recordedOccurrenceKeys={listingDto.dto.recordedOccurrenceKeys}
      tribeSlug={slug}
      viewerPermissions={listingDto.dto.viewerPermissions}
    />
  );
}
