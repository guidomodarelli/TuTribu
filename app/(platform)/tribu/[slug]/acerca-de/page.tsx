import { CommunityComingSoonPage } from "../community-coming-soon-page";

const COMMUNITY_ABOUT_PAGE = {
  heading: "Acerca de",
  operation: "community-about-page",
} as const;

export default async function CommunityAboutPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return CommunityComingSoonPage({
    heading: COMMUNITY_ABOUT_PAGE.heading,
    operation: COMMUNITY_ABOUT_PAGE.operation,
    params,
  });
}
