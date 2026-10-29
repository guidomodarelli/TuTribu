import type {
  MessagePollResult,
  TribeRoundResult,
  TribeRoundSharedDataResult,
  TribeRoundViewerStateResult,
} from "@/src/modules/messages/application/results/tribe-round-result";

/**
 * Personalizes the shared round data for one viewer: likes, edit and delete
 * permissions, and the viewer's poll selections.
 *
 * @param sharedData - Round data shared by every viewer.
 * @param viewerState - Likes, poll selections and permissions of the viewer.
 * @param applyPollViewerState - Applies the viewer's selections to one poll.
 * @returns The round as the viewer sees it.
 */
export function applyTribeRoundViewerState(
  sharedData: TribeRoundSharedDataResult,
  viewerState: TribeRoundViewerStateResult,
  applyPollViewerState: (
    poll: MessagePollResult,
    selectedPollOptionIds: Set<string>
  ) => MessagePollResult
): TribeRoundResult {
  const likedMessageIds = new Set(viewerState.likedMessageIds);
  const selectedPollOptionIds = new Set(viewerState.selectedPollOptionIds);
  const canManageOwnMessages = viewerState.viewerPermissions.canCreateMessage;
  const canDeleteStaffMessages = Boolean(
    viewerState.viewerPermissions.canPinMessages
  );

  return {
    activeChannelId: sharedData.activeChannelId,
    channels: sharedData.channels,
    messages: sharedData.messages.map((message) => {
      const isViewerAuthor = message.author.id === viewerState.viewerId;

      return {
        ...message,
        hasLoadedReplies: message.replyCount === 0,
        likedByViewer: likedMessageIds.has(message.id),
        permissions: {
          canDelete:
            (isViewerAuthor && canManageOwnMessages) || canDeleteStaffMessages,
          canEdit: isViewerAuthor && canManageOwnMessages,
        },
        poll: message.poll
          ? applyPollViewerState(message.poll, selectedPollOptionIds)
          : null,
        replies: [],
      };
    }),
    pagination: sharedData.pagination,
    viewerPermissions: viewerState.viewerPermissions,
  };
}

/**
 * Normalizes a requested round page: anything but a positive integer is page 1.
 *
 * @param page - Requested page.
 * @returns A valid page number.
 */
export function normalizeTribeRoundPage(page: number | undefined): number {
  if (!Number.isInteger(page) || !page || page < 1) {
    return 1;
  }

  return page;
}

/**
 * Normalizes a requested channel slug, treating blank values as no channel.
 *
 * @param channelSlug - Requested channel slug.
 * @returns The trimmed slug, or null.
 */
export function normalizeTribeRoundChannelSlug(
  channelSlug: string | null | undefined
): string | null {
  const normalizedChannelSlug = channelSlug?.trim() ?? "";

  return normalizedChannelSlug.length > 0 ? normalizedChannelSlug : null;
}
