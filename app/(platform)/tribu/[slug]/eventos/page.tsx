import { TribeComingSoonPage } from "../tribe-coming-soon-page";

const TRIBE_EVENTS_PAGE = {
  heading: "Eventos",
  operation: "tribe-events-page",
} as const;

export default async function TribeEventsPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return TribeComingSoonPage({
    heading: TRIBE_EVENTS_PAGE.heading,
    operation: TRIBE_EVENTS_PAGE.operation,
    params,
  });
}
