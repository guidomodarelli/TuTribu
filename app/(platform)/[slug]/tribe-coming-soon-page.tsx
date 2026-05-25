import { ComingSoonSection } from "@/components/feedback/coming-soon-section";
import { resolveVisibleTribePageAccess } from "./tribe-page-access";

type TribeComingSoonPageProps = {
  heading: string;
  operation: string;
  params: Promise<{
    slug: string;
  }>;
};

export async function TribeComingSoonPage({
  heading,
  operation,
  params,
}: TribeComingSoonPageProps) {
  const { slug } = await params;

  await resolveVisibleTribePageAccess({
    operation,
    slug,
  });

  return <ComingSoonSection heading={heading} />;
}
