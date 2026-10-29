
import { TribeChannelManagement } from "@/components/tribe-round/tribe-channel-management";
import { ROUTES } from "@/src/constants/routes";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";
import { requireTribeManagerMembership } from "../tribe-manager-page-access";

const CHANNEL_MANAGEMENT_PAGE_LOG = {
  operation: "tribe-channel-management-page",
  resolveChannelsFailureMessage: "Failed to resolve tribe channels",
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

  await requireTribeManagerMembership(modules, tribe.slug);

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
      // A load failure is not a missing page: the segment error boundary offers a retry inside the shell.
      throw error;
    });

  return (
    <div>
      <TribeChannelManagement
        channels={channelResult.channels}
        tribeSlug={tribe.slug}
      />
    </div>
  );
}
