import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { COMMUNITY_PAGE_ACCESS_STATUS } from "@/src/modules/communities/application/results/community-page-access-result";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import styles from "./page.module.scss";

const COMMUNITY_PAGE_LOG_REASON = {
  unexpectedRepositoryError: "unexpected_repository_error",
} as const;

const COMMUNITY_PAGE_LOG = {
  feature: "communities",
  hiddenAccessMessage: "Community access hidden",
  operation: "community-page",
  resolveAccessFailureMessage: "Failed to resolve community access",
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

  return <main className={styles.CommunityPage} />;
}
