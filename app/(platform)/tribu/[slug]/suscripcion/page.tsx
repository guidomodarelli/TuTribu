/**
 * Renders the member subscription self-management page.
 *
 * @module tribe-subscription-page
 */

import { notFound } from "next/navigation";

import { TribeSubscriptionSelfManagement } from "@/components/subscriptions/tribe-subscription-self-management";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const SUBSCRIPTION_PAGE_LOG = {
  operation: "tribe-subscription-page",
} as const;

export default async function TribeSubscriptionPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { modules, tribe, subscriptionReconciliationResult } =
    await resolveVisibleTribePageAccess({
      operation: SUBSCRIPTION_PAGE_LOG.operation,
      slug,
    });
  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(tribe.slug);

  if (
    membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active ||
    subscriptionReconciliationResult?.status !==
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.active
  ) {
    notFound();
  }

  return (
    <main>
      <TribeSubscriptionSelfManagement
        subscriptionStatus={subscriptionReconciliationResult.status}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
