import { notFound } from "next/navigation";

import { TribeFeed } from "@/components/tribe-feed/tribe-feed";
import { resolveVisibleTribePageAccess } from "./tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_PAGE_LOG_REASON = {
  unexpectedFeedRepositoryError: "unexpected_feed_repository_error",
} as const;

const TRIBE_PAGE_LOG = {
  operation: "tribe-page",
  resolveFeedFailureMessage: "Failed to resolve tribe feed",
} as const;

export default async function TribePage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, tribe, logger, modules } =
    await resolveVisibleTribePageAccess({
      operation: TRIBE_PAGE_LOG.operation,
      slug,
    });

  const feed = await modules.posts.useCases.listTribeFeed({
    tribeSlug: tribe.slug,
    viewerId: authenticatedMember.id,
  }).catch((error: unknown) => {
    logger.error({
      message: TRIBE_PAGE_LOG.resolveFeedFailureMessage,
      error,
      metadata: {
        reason: TRIBE_PAGE_LOG_REASON.unexpectedFeedRepositoryError,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });
    notFound();
  });

  return (
    <main className={styles.TribePage}>
      <TribeFeed
        authenticatedMember={authenticatedMember}
        tribeSlug={tribe.slug}
        feed={feed}
      />
    </main>
  );
}
