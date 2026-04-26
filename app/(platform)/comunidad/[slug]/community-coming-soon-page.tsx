import { ComingSoonSection } from "@/components/feedback/coming-soon-section";
import { resolveVisibleCommunityPageAccess } from "./community-page-access";

type CommunityComingSoonPageProps = {
  heading: string;
  operation: string;
  params: Promise<{
    slug: string;
  }>;
};

export async function CommunityComingSoonPage({
  heading,
  operation,
  params,
}: CommunityComingSoonPageProps) {
  const { slug } = await params;

  await resolveVisibleCommunityPageAccess({
    operation,
    slug,
  });

  return <ComingSoonSection heading={heading} />;
}
