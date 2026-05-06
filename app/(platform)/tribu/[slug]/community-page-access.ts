import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { COMMUNITY_PAGE_ACCESS_STATUS } from "@/src/modules/communities/application/results/community-page-access-result";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const COMMUNITY_PAGE_ACCESS_LOG_REASON = {
  unexpectedRepositoryError: "unexpected_repository_error",
} as const;

const COMMUNITY_PAGE_ACCESS_LOG = {
  feature: "communities",
  hiddenAccessMessage: "Community access hidden",
  resolveAccessFailureMessage: "Failed to resolve community access",
} as const;

type ResolveVisibleCommunityPageAccessOptions = {
  operation: string;
  slug: string;
};

export async function resolveVisibleCommunityPageAccess({
  operation,
  slug,
}: ResolveVisibleCommunityPageAccessOptions) {
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const logger = createServerLogger({
    feature: COMMUNITY_PAGE_ACCESS_LOG.feature,
    operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  const accessResult = await modules.communities.useCases
    .getCommunityPageAccess({
      isAuthenticated: Boolean(authenticatedMember),
      slug,
    })
    .catch((error: unknown) => {
      logger.error({
        message: COMMUNITY_PAGE_ACCESS_LOG.resolveAccessFailureMessage,
        error,
        metadata: {
          reason: COMMUNITY_PAGE_ACCESS_LOG_REASON.unexpectedRepositoryError,
          slug,
          viewerId: authenticatedMember?.id ?? null,
        },
      });
      notFound();
    });

  if (accessResult.status === COMMUNITY_PAGE_ACCESS_STATUS.hidden) {
    logger.info({
      message: COMMUNITY_PAGE_ACCESS_LOG.hiddenAccessMessage,
      metadata: {
        reason: accessResult.reason,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });

    notFound();
  }

  if (!authenticatedMember) {
    notFound();
  }

  return {
    authenticatedMember,
    community: accessResult.community,
    logger,
    modules,
  };
}
