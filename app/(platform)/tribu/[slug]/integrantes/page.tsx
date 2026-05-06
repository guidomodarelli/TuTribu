import { TribeComingSoonPage } from "../tribe-coming-soon-page";

const TRIBE_TRIBEMATES_PAGE = {
  heading: "Integrantes",
  operation: "tribe-tribemates-page",
} as const;

export default async function TribeTribematesPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return TribeComingSoonPage({
    heading: TRIBE_TRIBEMATES_PAGE.heading,
    operation: TRIBE_TRIBEMATES_PAGE.operation,
    params,
  });
}
