import type {
  MessagePollResult,
  TribeRoundResult,
  TribeRoundRepliesResult,
  TribeRoundSharedDataResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import { TRIBE_ROUND_PAGE_SIZE } from "@/src/modules/messages/constants/message-round";
import type {
  ListMessageRepliesQuery,
  ListTribeRoundQuery,
  ListTribeRoundSharedDataQuery,
  MessageRoundReadRepository,
} from "@/src/modules/messages/domain/repositories/message-round-read-repository";

type ListTribeRoundDependencies = {
  listCachedTribeRoundSharedData?: (
    query: ListTribeRoundSharedDataQuery
  ) => Promise<TribeRoundSharedDataResult>;
  messageRoundReadRepository: MessageRoundReadRepository;
};

function hidePollResults(poll: MessagePollResult): MessagePollResult {
  return {
    ...poll,
    options: poll.options.map((option) => ({
      ...option,
      percentage: 0,
      voteCount: 0,
    })),
  };
}

function applyViewerPollState({
  poll,
  selectedPollOptionIds,
}: {
  poll: MessagePollResult;
  selectedPollOptionIds: Set<string>;
}): MessagePollResult {
  const options = poll.options.map((option) => ({
    ...option,
    selectedByViewer: selectedPollOptionIds.has(option.id),
  }));
  const viewerHasVoted = options.some((option) => option.selectedByViewer);
  const pollWithViewerState = {
    ...poll,
    options,
    viewerHasVoted,
  };

  if (!viewerHasVoted) {
    return hidePollResults(pollWithViewerState);
  }

  return pollWithViewerState;
}

function mergeTribeRoundWithViewerState({
  sharedData,
  viewerState,
}: {
  sharedData: TribeRoundSharedDataResult;
  viewerState: Awaited<
    ReturnType<MessageRoundReadRepository["listViewerStateByTribeSlug"]>
  >;
}): TribeRoundResult {
  const likedMessageIds = new Set(viewerState.likedMessageIds);
  const selectedPollOptionIds = new Set(viewerState.selectedPollOptionIds);
  const canDeleteOwnMessages = Boolean(
    viewerState.viewerPermissions.canCreateMessage
  );
  const canDeleteStaffMessages = Boolean(
    viewerState.viewerPermissions.canPinMessages
  );

  return {
    activeChannelId: sharedData.activeChannelId,
    channels: sharedData.channels,
    messages: sharedData.messages.map((message) => {
      return {
        ...message,
        hasLoadedReplies: false,
        likedByViewer: likedMessageIds.has(message.id),
        permissions: {
          canDelete:
            (message.author.id === viewerState.viewerId && canDeleteOwnMessages) ||
            canDeleteStaffMessages,
        },
        poll: message.poll
          ? applyViewerPollState({
              poll: message.poll,
              selectedPollOptionIds,
            })
          : null,
        replies: [],
      };
    }),
    pagination: sharedData.pagination,
    viewerPermissions: viewerState.viewerPermissions,
  };
}

function normalizePage(page: number | undefined): number {
  if (!Number.isInteger(page) || !page || page < 1) {
    return 1;
  }

  return page;
}

function normalizeChannelSlug(channelSlug: string | null | undefined): string | null {
  const normalizedChannelSlug = channelSlug?.trim() ?? "";

  return normalizedChannelSlug.length > 0 ? normalizedChannelSlug : null;
}

export function listTribeRound({
  listCachedTribeRoundSharedData,
  messageRoundReadRepository,
}: ListTribeRoundDependencies) {
  return async (query: ListTribeRoundQuery): Promise<TribeRoundResult> => {
    const normalizedQuery = {
      channelSlug: normalizeChannelSlug(query.channelSlug),
      page: normalizePage(query.page),
      tribeSlug: query.tribeSlug.trim(),
      viewerId: query.viewerId,
    };
    const readSharedData =
      listCachedTribeRoundSharedData ??
      messageRoundReadRepository.listSharedDataByTribeSlug.bind(
        messageRoundReadRepository
      );
    const [sharedData, viewerState] = await Promise.all([
      readSharedData(normalizedQuery),
      messageRoundReadRepository.listViewerStateByTribeSlug(normalizedQuery),
    ]);

    return mergeTribeRoundWithViewerState({
      sharedData,
      viewerState,
    });
  };
}

export function listMessageReplies({
  messageRoundReadRepository,
}: ListTribeRoundDependencies) {
  return async (
    query: ListMessageRepliesQuery
  ): Promise<TribeRoundRepliesResult> => {
    return messageRoundReadRepository.listRepliesByMessageId({
      messageId: query.messageId,
      tribeSlug: query.tribeSlug.trim(),
      viewerId: query.viewerId,
    });
  };
}

export function createEmptyTribeRoundPagination(currentPage = 1) {
  return {
    currentPage,
    hasNextPage: false,
    hasPreviousPage: currentPage > 1,
    pageSize: TRIBE_ROUND_PAGE_SIZE,
  };
}
