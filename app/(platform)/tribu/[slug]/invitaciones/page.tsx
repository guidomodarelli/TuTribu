import { notFound } from "next/navigation";

import { TribeInvitationManagement } from "@/components/tribes/tribe-invitation-management";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const INVITATION_MANAGEMENT_PAGE_LOG = {
  operation: "tribe-invitation-management-page",
  resolveInvitationsFailureMessage: "Failed to resolve tribe invitations",
  resolvePricesFailureMessage: "Failed to resolve tribe subscription prices",
} as const;

const INVITATION_MANAGER_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

const INVITATION_PRICE_STATUS = {
  active: "active",
} as const;

export default async function TribeInvitationsPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, tribe, logger, modules } =
    await resolveVisibleTribePageAccess({
      operation: INVITATION_MANAGEMENT_PAGE_LOG.operation,
      slug,
    });

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);

  if (
    currentMembership?.role !== INVITATION_MANAGER_ROLE.leader &&
    currentMembership?.role !== INVITATION_MANAGER_ROLE.guardian
  ) {
    notFound();
  }

  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(
      tribe.slug
    );

  if (membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active) {
    notFound();
  }

  const [invitations, pricesListing] = await Promise.all([
    modules.tribes.useCases
      .listTribeInvitations({
        baseUrl: resolvePublicAppBaseUrl(),
        tribeSlug: tribe.slug,
      })
      .catch((error: unknown) => {
        logger.error({
          message:
            INVITATION_MANAGEMENT_PAGE_LOG.resolveInvitationsFailureMessage,
          error,
          metadata: {
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return [];
      }),
    modules.subscriptions.useCases
      .listTribeSubscriptionPrices({
        tribeSlug: tribe.slug,
      })
      .catch((error: unknown) => {
        logger.error({
          message: INVITATION_MANAGEMENT_PAGE_LOG.resolvePricesFailureMessage,
          error,
          metadata: {
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return null;
      }),
  ]);

  const availablePrices = (pricesListing?.prices ?? [])
    .filter((price) => price.status === INVITATION_PRICE_STATUS.active)
    .map((price) => ({
      amountCents: price.amountCents,
      currency: price.currency,
      id: price.id,
      isCurrent: price.isCurrent,
      name: price.name,
    }));
  const canManagePrices =
    pricesListing?.viewerPermissions.canManagePrices ?? false;

  return (
    <main>
      <TribeInvitationManagement
        availablePrices={availablePrices}
        canManagePrices={canManagePrices}
        invitations={invitations}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
