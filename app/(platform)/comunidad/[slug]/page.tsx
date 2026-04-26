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

const COMMUNITY_HOME_COPY = {
  subtitle: "Compartí novedades, preguntas y recursos con los miembros.",
  welcomeEyebrow: "Inicio de comunidad",
} as const;

const COMMUNITY_HOME_ATTRIBUTES = {
  communityTitleId: "community-title",
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
      <section
        className={styles.CommunityPage__header}
        aria-labelledby={COMMUNITY_HOME_ATTRIBUTES.communityTitleId}
      >
        <div className={styles.CommunityPage__identity}>
          <p className={styles.CommunityPage__eyebrow}>
            {COMMUNITY_HOME_COPY.welcomeEyebrow}
          </p>
          <h1
            className={styles.CommunityPage__title}
            id={COMMUNITY_HOME_ATTRIBUTES.communityTitleId}
          >
            {community.name}
          </h1>
          <p className={styles.CommunityPage__subtitle}>
            {COMMUNITY_HOME_COPY.subtitle}
          </p>
        </div>
      </section>

      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug={community.slug}
        feed={feed}
      />
    </main>
  );
}
