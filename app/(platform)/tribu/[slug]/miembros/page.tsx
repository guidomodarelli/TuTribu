import { TribeComingSoonPage } from "../tribe-coming-soon-page";

const TRIBE_MEMBERS_PAGE = {
  heading: "Miembros",
  operation: "tribe-members-page",
} as const;

export default async function TribeMembersPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  return TribeComingSoonPage({
    heading: TRIBE_MEMBERS_PAGE.heading,
    operation: TRIBE_MEMBERS_PAGE.operation,
    params,
  });
}
