import { ROUTES } from "@/src/constants/routes";
import { TribeComingSoonPage } from "../tribe-coming-soon-page";

const TRIBE_MERITS_PAGE = {
  heading: "Méritos",
  operation: "tribe-merits-page",
} as const;

export default async function TribeMeritsPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return TribeComingSoonPage({
    buildCallbackPath: ROUTES.tribes.merits,
    heading: TRIBE_MERITS_PAGE.heading,
    operation: TRIBE_MERITS_PAGE.operation,
    params,
  });
}
