import { CommunityComingSoonPage } from "../community-coming-soon-page";

const COMMUNITY_RANKING_PAGE = {
  heading: "Ranking",
  operation: "community-ranking-page",
} as const;

export default async function CommunityRankingPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return CommunityComingSoonPage({
    heading: COMMUNITY_RANKING_PAGE.heading,
    operation: COMMUNITY_RANKING_PAGE.operation,
    params,
  });
}
