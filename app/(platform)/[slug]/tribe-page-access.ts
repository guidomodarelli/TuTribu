import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { ROUTES } from "@/src/constants/routes";
import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
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

/** Props of a page under `/[slug]` whose only dynamic segment is the tribe slug. */
export type TribeSlugPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type ResolveTribePageAccessOptions = {
  /**
   * Channel surfaces (the campfire) accept a member who reads a channel
   * under the channel access rule, such as a free academy member.
   */
  allowWithChannelReadAccess?: boolean;
  /**
   * Academy free allowlist surfaces (academy pages, courses, billing) accept a
   * basic member of an academy-mode tribe. Community surfaces leave it off.
   */
  allowWithoutCommunityAccess?: boolean;
  operation: string;
  slug: string;
};

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;

/**
 * Module graph seen by the optional subscription reconciliation. Partial
 * graphs (route fixtures without a subscriptions module) skip it, so the
 * reconciliation use case is read as possibly absent.
 */
type SubscriptionReconciliationModules = {
  subscriptions?: {
    useCases?: Partial<
      Pick<
        RequestModules["subscriptions"]["useCases"],
        "reconcileCurrentTribeMemberSubscription"
      >
    >;
  };
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
  allowWithChannelReadAccess = false,
  allowWithoutCommunityAccess = false,
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

  const subscriptionReconciliationModules: SubscriptionReconciliationModules | null =
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
      allowWithChannelReadAccess,
      allowWithoutCommunityAccess,
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
 * link while signed out) never ends in a misleading 404. A signed-in non-member
 * of a tribe with a public academy offer is sent to that offer, also like the
 * tribe home, so a shared section link leads to the entry request. Other
 * viewers without access still get `notFound()` so hidden tribes stay hidden, while a
 * failure to resolve access propagates to the segment error boundary.
 *
 * @param options - Log operation, tribe slug, and the page's callback path.
 * @returns The authenticated member, the visible tribe, and request modules.
 */
export async function resolveVisibleTribePageAccess({
  callbackPath,
  ...options
}: ResolveVisibleTribePageAccessOptions) {
  // A failure to resolve access is transient, not a hidden tribe: it reaches the segment error boundary, which offers a
  // retry inside the shell, instead of a misleading 404.
  const access = await resolveTribePageAccess(options);

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

    // A basic academy member has a valid membership: guide them to the
    // academy page (offer and personal steps) instead of a 404.
    if (accessResult.reason === TRIBE_PAGE_ACCESS_REASON.academyAccessRequired) {
      redirect(ROUTES.tribes.academy(options.slug));
    }

    // A signed-in visitor who is not a member yet (for example, someone on the
    // admission allowlist who opened a link the leader shared) lands on the
    // public academy offer, where they can request entry, instead of a 404.
    // The offer is the same minimum public data the tribe home already exposes.
    if (accessResult.reason === TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible) {
      const academyOffer = await modules.productAccess.useCases
        .getAcademyPublicOffer({ tribeSlug: options.slug })
        .catch(() => null);

      if (academyOffer) {
        redirect(ROUTES.tribes.academy(options.slug));
      }
    }

    notFound();
  }

  return {
    authenticatedMember,
    communityAccess: accessResult.communityAccess,
    tribe: accessResult.tribe,
    logger,
    modules,
    subscriptionReconciliationResult,
  };
}
