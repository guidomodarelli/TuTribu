import { notFound } from "next/navigation";

import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import { TribeEventsUnavailable } from "@/components/events/tribe-events-unavailable";
import {
  tribeEventAttendanceStreakSchema,
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
    type?: string | string[];
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

  // Failures are logged here, where the user-facing response is owned, and
  // degrade to a safe fallback instead of breaking the whole route. The
  // streak is optional: without it the page simply omits that line.
  const [listing, attendanceStreak] = await Promise.all([
    modules.events.useCases
      .listTribeEvents({
        // The type filter is applied on the client (chips toggle without a
        // request), so the page always lists every type.
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
      }),
    modules.events.useCases
      .getTribeEventAttendanceStreak({ tribeSlug: slug })
      .catch((error: unknown) => {
        logger.error({
          message: TRIBE_EVENTS_PAGE.streakFailureMessage,
          error,
          metadata: {
            ...logMetadata,
            reason: TRIBE_EVENTS_PAGE.listFailureReason,
          },
        });

        return null;
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

  const streakDto = parseTribeEventPublicDto(
    tribeEventAttendanceStreakSchema,
    attendanceStreak
  );

  if (!streakDto.isUsable) {
    logRejectedTribeEventPublicDto(logger, streakDto.issues, logMetadata);
  }

  return (
    <TribeEventsCalendar
      attendanceStreak={streakDto.isUsable ? streakDto.dto : null}
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
