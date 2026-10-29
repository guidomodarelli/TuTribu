
import { TribeChannelManagement } from "@/components/tribe-round/tribe-channel-management";
import { ROUTES } from "@/src/constants/routes";
import type { TribeSlugPageProps } from "../tribe-page-access";
import { resolveTribeManagerPageAccess } from "../tribe-manager-page-access";

const CHANNEL_MANAGEMENT_PAGE_LOG = {
  operation: "tribe-channel-management-page",
  resolveChannelsFailureMessage: "Failed to resolve tribe channels",
} as const;

export default async function TribeChannelsPage({ params }: TribeSlugPageProps) {
  const { slug } = await params;
  const { authenticatedMember, tribe, logger, modules } =
    await resolveTribeManagerPageAccess({
      callbackPath: ROUTES.tribes.channels(slug),
      operation: CHANNEL_MANAGEMENT_PAGE_LOG.operation,
      slug,
    });

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
