import { CommunityComingSoonPage } from "../community-coming-soon-page";

const COMMUNITY_MEMBERS_PAGE = {
  heading: "Miembros",
  operation: "community-members-page",
} as const;

export default async function CommunityMembersPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return CommunityComingSoonPage({
    heading: COMMUNITY_MEMBERS_PAGE.heading,
    operation: COMMUNITY_MEMBERS_PAGE.operation,
    params,
  });
}
