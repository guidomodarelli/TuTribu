import { TribeComingSoonPage } from "../tribe-coming-soon-page";

const TRIBE_TRIBE_PAGE = {
  heading: "Tribu",
  operation: "tribe-tribe-page",
} as const;

export default async function TribeTribePage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return TribeComingSoonPage({
    heading: TRIBE_TRIBE_PAGE.heading,
    operation: TRIBE_TRIBE_PAGE.operation,
    params,
  });
}
