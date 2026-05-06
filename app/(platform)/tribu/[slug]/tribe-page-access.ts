import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { TRIBE_PAGE_ACCESS_STATUS } from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const TRIBE_PAGE_ACCESS_LOG_REASON = {
  unexpectedRepositoryError: "unexpected_repository_error",
} as const;

const TRIBE_PAGE_ACCESS_LOG = {
  feature: "tribes",
  hiddenAccessMessage: "Tribe access hidden",
  resolveAccessFailureMessage: "Failed to resolve tribe access",
} as const;

type ResolveVisibleTribePageAccessOptions = {
  operation: string;
  slug: string;
};

export async function resolveVisibleTribePageAccess({
  operation,
  slug,
}: ResolveVisibleTribePageAccessOptions) {
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const logger = createServerLogger({
    feature: TRIBE_PAGE_ACCESS_LOG.feature,
    operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  const accessResult = await modules.tribes.useCases
    .getTribePageAccess({
      isAuthenticated: Boolean(authenticatedMember),
      slug,
    })
    .catch((error: unknown) => {
      logger.error({
        message: TRIBE_PAGE_ACCESS_LOG.resolveAccessFailureMessage,
        error,
        metadata: {
          reason: TRIBE_PAGE_ACCESS_LOG_REASON.unexpectedRepositoryError,
          slug,
          viewerId: authenticatedMember?.id ?? null,
        },
      });
      notFound();
    });

  if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
    logger.info({
      message: TRIBE_PAGE_ACCESS_LOG.hiddenAccessMessage,
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
    tribe: accessResult.tribe,
    logger,
    modules,
  };
}
