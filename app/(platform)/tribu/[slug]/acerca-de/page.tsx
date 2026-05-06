import { TribeComingSoonPage } from "../tribe-coming-soon-page";

const TRIBE_ABOUT_PAGE = {
  heading: "Acerca de",
  operation: "tribe-about-page",
} as const;

export default async function TribeAboutPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return TribeComingSoonPage({
    heading: TRIBE_ABOUT_PAGE.heading,
    operation: TRIBE_ABOUT_PAGE.operation,
    params,
  });
}
