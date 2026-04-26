import { notFound } from "next/navigation";

import { CommunityFeed } from "@/components/community-feed/community-feed";
import { resolveVisibleCommunityPageAccess } from "./community-page-access";
import styles from "./page.module.scss";

const COMMUNITY_PAGE_LOG_REASON = {
  unexpectedFeedRepositoryError: "unexpected_feed_repository_error",
} as const;

const COMMUNITY_PAGE_LOG = {
  operation: "community-page",
  resolveFeedFailureMessage: "Failed to resolve community feed",
} as const;

export default async function CommunityPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, community, logger, modules } =
    await resolveVisibleCommunityPageAccess({
      operation: COMMUNITY_PAGE_LOG.operation,
      slug,
    });

  const feed = await modules.posts.useCases.listCommunityFeed({
    communitySlug: community.slug,
    viewerId: authenticatedMember.id,
  }).catch((error: unknown) => {
    logger.error({
      message: COMMUNITY_PAGE_LOG.resolveFeedFailureMessage,
      error,
      metadata: {
        reason: COMMUNITY_PAGE_LOG_REASON.unexpectedFeedRepositoryError,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });
    notFound();
  });

  return (
    <main className={styles.CommunityPage}>
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug={community.slug}
        feed={feed}
      />
    </main>
  );
}
