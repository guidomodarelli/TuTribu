import { notFound, redirect } from "next/navigation";

import { SubscriptionReturnStatus } from "@/components/subscriptions/subscription-return-status";
import { ROUTES } from "@/src/constants/routes";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { TribeRound } from "@/components/tribe-round/tribe-round";
import {
  TRIBE_MEMBERSHIP_STATUS_REASON,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { resolveTribePageAccess } from "./tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_PAGE_LOG_REASON = {
  unexpectedRoundRepositoryError: "unexpected_round_repository_error",
  unexpectedSubscriptionReturnRepositoryError:
    "unexpected_subscription_return_repository_error",
} as const;

const TRIBE_PAGE_LOG = {
  hiddenAccessMessage: "Tribe access hidden",
  operation: "tribe-page",
  resolveRoundFailureMessage: "Failed to resolve tribe round",
  resolveSubscriptionReturnFailureMessage:
    "Failed to resolve subscription return",
} as const;

const TRIBE_PAGE_QUERY = {
  mercadoPagoPreapprovalId: "preapproval_id",
} as const;

const SUBSCRIPTION_RETURN_BLOCKED_REASONS: ReadonlySet<string> = new Set([
  TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked,
  TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive,
]);

const SUBSCRIPTION_RETURN_VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.removedBySubscription,
]);

type TribePageSearchParams = {
  [TRIBE_PAGE_QUERY.mercadoPagoPreapprovalId]?: string | string[];
};

function readFirstSearchParamValue(
  searchParamValue: string | string[] | undefined
): string | null {
  if (typeof searchParamValue === "string") {
    return searchParamValue;
  }

  if (Array.isArray(searchParamValue)) {
    const firstStringValue = searchParamValue.find(
      (value) => value.trim().length > 0
    );

    return firstStringValue ?? null;
  }

  return null;
}

function renderSubscriptionReturnStatus() {
  return (
    <main className={styles.TribePage}>
      <SubscriptionReturnStatus />
    </main>
  );
}

export default async function TribePage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<TribePageSearchParams>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const mercadoPagoPreapprovalId = readFirstSearchParamValue(
    resolvedSearchParams[TRIBE_PAGE_QUERY.mercadoPagoPreapprovalId]
  );
  const access = await resolveTribePageAccess({
    operation: TRIBE_PAGE_LOG.operation,
    slug,
  }).catch(() => {
    notFound();
  });

  if (!access) {
    notFound();
  }

  const {
    authenticatedMember,
    logger,
    modules,
    requestId,
    result: accessResult,
  } = access;

  if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
    logger.info({
      message: TRIBE_PAGE_LOG.hiddenAccessMessage,
      metadata: {
        reason: accessResult.reason,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });

    if (
      accessResult.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden &&
      SUBSCRIPTION_RETURN_BLOCKED_REASONS.has(accessResult.blockedReason) &&
      mercadoPagoPreapprovalId
    ) {
      const subscriptionConfirmationModules = await createRequestModules({
        mercadoPagoWebhookVerified: true,
        requestId,
      });
      const resolveSubscriptionReturn =
        subscriptionConfirmationModules.subscriptions.useCases
          .resolveTribeMemberSubscriptionReturn;
      const validatePendingSubscriptionReturn =
        modules.subscriptions.useCases.validatePendingTribeMemberSubscriptionReturn;
      const subscriptionReturn = resolveSubscriptionReturn
        ? await resolveSubscriptionReturn({
            providerSubscriptionId: mercadoPagoPreapprovalId,
            tribeSlug: slug,
          })
          .catch((error: unknown) => {
            logger.error({
              message: TRIBE_PAGE_LOG.resolveSubscriptionReturnFailureMessage,
              error,
              metadata: {
                reason:
                  TRIBE_PAGE_LOG_REASON.unexpectedSubscriptionReturnRepositoryError,
                slug,
                viewerId: authenticatedMember?.id ?? null,
              },
            });

            return null;
          })
        : (await validatePendingSubscriptionReturn({
            providerSubscriptionId: mercadoPagoPreapprovalId,
            tribeSlug: slug,
          }))
          ? { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending }
          : null;

      if (subscriptionReturn?.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.active) {
        redirect(ROUTES.tribes.bySlug(slug));
      }

      if (subscriptionReturn?.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused) {
        redirect(ROUTES.tribes.subscription(slug));
      }

      if (
        subscriptionReturn &&
        SUBSCRIPTION_RETURN_VISIBLE_STATUSES.has(subscriptionReturn.status)
      ) {
        return renderSubscriptionReturnStatus();
      }
    }

    notFound();
  }

  if (!authenticatedMember) {
    notFound();
  }

  const round = await modules.messages.useCases.listTribeRound({
    tribeSlug: accessResult.tribe.slug,
    viewerId: authenticatedMember.id,
  }).catch((error: unknown) => {
    logger.error({
      message: TRIBE_PAGE_LOG.resolveRoundFailureMessage,
      error,
      metadata: {
        reason: TRIBE_PAGE_LOG_REASON.unexpectedRoundRepositoryError,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });
    notFound();
  });

  return (
    <main className={styles.TribePage}>
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug={accessResult.tribe.slug}
        round={round}
      />
    </main>
  );
}
