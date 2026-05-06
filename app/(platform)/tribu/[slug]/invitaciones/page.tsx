import { notFound } from "next/navigation";

import { TribeInvitationManagement } from "@/components/tribes/tribe-invitation-management";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const INVITATION_MANAGEMENT_PAGE_LOG = {
  operation: "tribe-invitation-management-page",
  resolveInvitationsFailureMessage: "Failed to resolve tribe invitations",
} as const;

const INVITATION_MANAGER_ROLE = {
  guardian: "guardian",
  leader: "leader",
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

  const invitations = await modules.tribes.useCases
    .listTribeInvitations({
      tribeSlug: tribe.slug,
    })
    .catch((error: unknown) => {
      logger.error({
        message: INVITATION_MANAGEMENT_PAGE_LOG.resolveInvitationsFailureMessage,
        error,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });

      return [];
    });

  return (
    <main>
      <TribeInvitationManagement
        invitations={invitations}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
