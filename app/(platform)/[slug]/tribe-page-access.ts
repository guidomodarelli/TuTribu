import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
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

type ResolveTribePageAccessOptions = {
  operation: string;
  slug: string;
};

type ResolveVisibleTribePageAccessOptions = ResolveTribePageAccessOptions & {
  /**
   * Internal path (with any query worth keeping) of the page being rendered.
   * A visitor without a session is sent to sign-in with this path as the
   * callback, so a member whose session expired lands back on the same page.
   */
  callbackPath: string;
};

export async function resolveTribePageAccess({
  operation,
  slug,
}: ResolveTribePageAccessOptions) {
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const logger = createServerLogger({
    feature: TRIBE_PAGE_ACCESS_LOG.feature,
    operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  const subscriptionReconciliationModules =
    authenticatedMember
      ? await createRequestModules({
          mercadoPagoWebhookVerified: true,
          requestId,
        })
      : null;
  const reconcileCurrentTribeMemberSubscription =
    subscriptionReconciliationModules?.subscriptions?.useCases
      ?.reconcileCurrentTribeMemberSubscription;
  const subscriptionReconciliationResult =
    authenticatedMember && reconcileCurrentTribeMemberSubscription
      ? await reconcileCurrentTribeMemberSubscription({
          tribeSlug: slug,
        }).catch((error: unknown) => {
          logger.error({
            message: TRIBE_PAGE_ACCESS_LOG.resolveAccessFailureMessage,
            error,
            metadata: {
              reason: TRIBE_PAGE_ACCESS_LOG_REASON.unexpectedRepositoryError,
              slug,
              viewerId: authenticatedMember.id,
            },
          });

          return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
        })
      : null;

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
      throw error;
    });

  return {
    authenticatedMember,
    logger,
    modules,
    requestId,
    result: accessResult,
    subscriptionReconciliationResult,
  };
}

/**
 * Resolves the access of a tribe section page that only members can see.
 *
 * A visitor without a session is redirected to sign-in with `callbackPath`, the
 * same rule the tribe home applies, so losing the session (or opening a saved
 * link while signed out) never ends in a misleading 404. Signed-in viewers
 * without access still get `notFound()` so hidden tribes stay hidden.
 *
 * @param options - Log operation, tribe slug, and the page's callback path.
 * @returns The authenticated member, the visible tribe, and request modules.
 */
export async function resolveVisibleTribePageAccess({
  callbackPath,
  ...options
}: ResolveVisibleTribePageAccessOptions) {
  const access = await resolveTribePageAccess(options).catch(() => {
    notFound();
  });

  if (!access) {
    notFound();
  }

  const {
    authenticatedMember,
    logger,
    modules,
    result: accessResult,
    subscriptionReconciliationResult,
  } = access;

  if (!authenticatedMember) {
    redirect(buildSignInRedirectUrl(callbackPath));
  }

  if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
    logger.info({
      message: TRIBE_PAGE_ACCESS_LOG.hiddenAccessMessage,
      metadata: {
        reason: accessResult.reason,
        slug: options.slug,
        viewerId: authenticatedMember.id,
      },
    });

    notFound();
  }

  return {
    authenticatedMember,
    tribe: accessResult.tribe,
    logger,
    modules,
    subscriptionReconciliationResult,
  };
}
