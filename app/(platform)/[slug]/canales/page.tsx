import { notFound } from "next/navigation";

import { TribeChannelManagement } from "@/components/tribe-round/tribe-channel-management";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { ROUTES } from "@/src/constants/routes";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const CHANNEL_MANAGEMENT_PAGE_LOG = {
  operation: "tribe-channel-management-page",
  resolveChannelsFailureMessage: "Failed to resolve tribe channels",
} as const;

const CHANNEL_MANAGER_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

export default async function TribeChannelsPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, tribe, logger, modules } =
    await resolveVisibleTribePageAccess({
      callbackPath: ROUTES.tribes.channels(slug),
      operation: CHANNEL_MANAGEMENT_PAGE_LOG.operation,
      slug,
    });

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);

  if (
    currentMembership?.role !== CHANNEL_MANAGER_ROLE.leader &&
    currentMembership?.role !== CHANNEL_MANAGER_ROLE.guardian
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

  const channelResult = await modules.messages.useCases
    .listTribeChannels({
      tribeSlug: tribe.slug,
      viewerId: authenticatedMember.id,
    })
    .catch((error: unknown) => {
      logger.error({
        message: CHANNEL_MANAGEMENT_PAGE_LOG.resolveChannelsFailureMessage,
        error,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });
      notFound();
    });

  return (
    <main>
      <TribeChannelManagement
        channels={channelResult.channels}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
