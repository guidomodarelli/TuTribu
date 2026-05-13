import type {
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

  return {
    activeChannelId: sharedData.activeChannelId,
    channels: sharedData.channels,
    messages: sharedData.messages.map((message) => ({
      ...message,
      hasLoadedReplies: false,
      likedByViewer: likedMessageIds.has(message.id),
      replies: [],
    })),
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
