import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const TRIBE_EVENTS_PAGE = {
  heading: "Eventos",
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
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const { modules } = await resolveVisibleTribePageAccess({
    operation: TRIBE_EVENTS_PAGE.operation,
    slug,
  });

  const result = await modules.events.useCases.listTribeEvents({
    month: resolvedSearchParams?.month,
    tribeSlug: slug,
  });

  return (
    <TribeEventsCalendar
      events={result.events}
      month={result.month}
      tribeSlug={slug}
      viewerPermissions={result.viewerPermissions}
    />
  );
}
