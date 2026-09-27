import { ComingSoonSection } from "@/components/feedback/coming-soon-section";
import { resolveVisibleTribePageAccess } from "./tribe-page-access";

type TribeComingSoonPageProps = {
  /** Builds the page path from the slug, used as the sign-in callback. */
  buildCallbackPath: (slug: string) => string;
  heading: string;
  operation: string;
  params: Promise<{
    slug: string;
  }>;
};

export async function TribeComingSoonPage({
  buildCallbackPath,
  heading,
  operation,
  params,
}: TribeComingSoonPageProps) {
  const { slug } = await params;

  await resolveVisibleTribePageAccess({
    callbackPath: buildCallbackPath(slug),
    operation,
    slug,
  });

  return <ComingSoonSection heading={heading} />;
}
