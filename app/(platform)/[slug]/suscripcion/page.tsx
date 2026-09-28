/**
 * Renders the member subscription self-management page.
 *
 * @module tribe-subscription-page
 */

import { notFound, redirect } from "next/navigation";

import { TribeSubscriptionPaymentStatus } from "@/components/subscriptions/tribe-subscription-payment-status";
import { TribeSubscriptionSelfManagement } from "@/components/subscriptions/tribe-subscription-self-management";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { ROUTES } from "@/src/constants/routes";
import type { TribeMemberSubscriptionStatusResult } from "@/src/modules/subscriptions/application/results/tribe-member-subscription-result";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_MEMBERSHIP_STATUS_REASON,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { resolveTribePageAccess } from "../tribe-page-access";

const SUBSCRIPTION_PAGE_LOG = {
  operation: "tribe-subscription-page",
} as const;

const SUBSCRIPTION_PAYMENT_VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
]);

const SUBSCRIPTION_PAYMENT_RECOVERABLE_BLOCKED_REASONS: ReadonlySet<string> =
  new Set([
    TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked,
    TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive,
  ]);

function resolveSubscriptionPaymentStatus(input: {
  blockedReason: string;
  subscriptionReconciliationResult: TribeMemberSubscriptionStatusResult | null;
}):
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending
  | null {
  const reconciliationStatus = input.subscriptionReconciliationResult?.status;

  if (
    !SUBSCRIPTION_PAYMENT_RECOVERABLE_BLOCKED_REASONS.has(input.blockedReason)
  ) {
    return null;
  }

  if (
    reconciliationStatus &&
    SUBSCRIPTION_PAYMENT_VISIBLE_STATUSES.has(reconciliationStatus)
  ) {
    return reconciliationStatus as
      | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused
      | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending;
  }

  if (input.blockedReason === TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked) {
    return TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked;
  }

  if (
    input.blockedReason === TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive
  ) {
    return TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled;
  }

  return null;
}

export default async function TribeSubscriptionPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const access = await resolveTribePageAccess({
    // Billing stays reachable so every member can manage their own charges.
    allowWithoutCommunityAccess: true,
    operation: SUBSCRIPTION_PAGE_LOG.operation,
    slug,
  }).catch(() => {
    notFound();
  });

  if (!access) {
    notFound();
  }

  const {
    authenticatedMember,
    modules,
    result: accessResult,
    subscriptionReconciliationResult,
  } = access;

  if (!authenticatedMember) {
    redirect(buildSignInRedirectUrl(ROUTES.tribes.subscription(slug)));
  }

  if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.visible) {
    const currentMembershipStatus =
      await modules.tribes.useCases.getCurrentTribeMembershipStatus(
        accessResult.tribe.slug
      );

    if (
      currentMembershipStatus === TRIBE_MEMBERSHIP_STATUS.active &&
      subscriptionReconciliationResult?.status ===
        TRIBE_MEMBER_SUBSCRIPTION_STATUS.active
    ) {
      return (
        <main>
          <TribeSubscriptionSelfManagement
            subscriptionStatus={subscriptionReconciliationResult.status}
            tribeSlug={accessResult.tribe.slug}
          />
        </main>
      );
    }
  }

  if (
    accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden &&
    accessResult.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden
  ) {
    const subscriptionPaymentStatus = resolveSubscriptionPaymentStatus({
      blockedReason: accessResult.blockedReason,
      subscriptionReconciliationResult,
    });

    if (subscriptionPaymentStatus) {
      return (
        <main>
          <TribeSubscriptionPaymentStatus
            subscriptionStatus={subscriptionPaymentStatus}
            tribeSlug={slug}
          />
        </main>
      );
    }
  }

  notFound();
}
