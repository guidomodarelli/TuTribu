import { TribeComingSoonPage } from "../tribe-coming-soon-page";

const TRIBE_RANKING_PAGE = {
  heading: "Ranking",
  operation: "tribe-ranking-page",
} as const;

export default async function TribeRankingPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return TribeComingSoonPage({
    heading: TRIBE_RANKING_PAGE.heading,
    operation: TRIBE_RANKING_PAGE.operation,
    params,
  });
}
