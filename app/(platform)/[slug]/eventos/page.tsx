import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import { TribeEventsUnavailable } from "@/components/events/tribe-events-unavailable";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const TRIBE_EVENTS_PAGE = {
  listFailureMessage: "Failed to list tribe events",
  listFailureReason: "unexpected_event_repository_error",
  operation: "tribe-events-page",
} as const;

export default async function TribeEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    month?: string;
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

  // A listing failure is logged here, where the user-facing response is owned,
  // and degrades to a safe fallback instead of breaking the whole route.
  const listing = await modules.events.useCases
    .listTribeEvents({
      month: resolvedSearchParams?.month,
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
    });

  if (!listing) {
    return <TribeEventsUnavailable tribeSlug={slug} />;
  }

  return (
    <TribeEventsCalendar
      events={listing.events}
      month={listing.month}
      tribeSlug={slug}
      viewerPermissions={listing.viewerPermissions}
    />
  );
}
