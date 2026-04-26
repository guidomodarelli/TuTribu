import { CommunityComingSoonPage } from "../community-coming-soon-page";

const COMMUNITY_EVENTS_PAGE = {
  heading: "Eventos",
  operation: "community-events-page",
} as const;

export default async function CommunityEventsPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return CommunityComingSoonPage({
    heading: COMMUNITY_EVENTS_PAGE.heading,
    operation: COMMUNITY_EVENTS_PAGE.operation,
    params,
  });
}
