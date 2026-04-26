import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { CommunityFeed } from "@/components/community-feed/community-feed";
import { COMMUNITY_PAGE_ACCESS_STATUS } from "@/src/modules/communities/application/results/community-page-access-result";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import styles from "./page.module.scss";

const COMMUNITY_PAGE_LOG_REASON = {
  unexpectedFeedRepositoryError: "unexpected_feed_repository_error",
  unexpectedRepositoryError: "unexpected_repository_error",
} as const;

const COMMUNITY_PAGE_LOG = {
  feature: "communities",
  hiddenAccessMessage: "Community access hidden",
  operation: "community-page",
  resolveAccessFailureMessage: "Failed to resolve community access",
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
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const logger = createServerLogger({
    feature: COMMUNITY_PAGE_LOG.feature,
    operation: COMMUNITY_PAGE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  const accessResult = await modules.communities.useCases.getCommunityPageAccess({
      isAuthenticated: Boolean(authenticatedMember),
      slug,
    })
    .catch((error: unknown) => {
      logger.error({
        message: COMMUNITY_PAGE_LOG.resolveAccessFailureMessage,
        error,
        metadata: {
          reason: COMMUNITY_PAGE_LOG_REASON.unexpectedRepositoryError,
          slug,
          viewerId: authenticatedMember?.id ?? null,
        },
      });
      notFound();
    });

  if (accessResult.status === COMMUNITY_PAGE_ACCESS_STATUS.hidden) {
    logger.info({
      message: COMMUNITY_PAGE_LOG.hiddenAccessMessage,
      metadata: {
        reason: accessResult.reason,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });

    notFound();
  }

  const community = accessResult.community;

  if (!authenticatedMember) {
    notFound();
  }

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

      <CommunityFeed communitySlug={community.slug} feed={feed} />
    </main>
  );
}
