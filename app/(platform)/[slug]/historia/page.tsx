import { TribeComingSoonPage } from "../tribe-coming-soon-page";

const TRIBE_HISTORY_PAGE = {
  heading: "Historia",
  operation: "tribe-history-page",
} as const;

export default async function TribeHistoryPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return TribeComingSoonPage({
    heading: TRIBE_HISTORY_PAGE.heading,
    operation: TRIBE_HISTORY_PAGE.operation,
    params,
  });
}
