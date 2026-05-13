import type {
  TribeRoundResult,
  TribeRoundSharedDataResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import type {
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
      likedByViewer: likedMessageIds.has(message.id),
    })),
    viewerPermissions: viewerState.viewerPermissions,
  };
}

export function listTribeRound({
  listCachedTribeRoundSharedData,
  messageRoundReadRepository,
}: ListTribeRoundDependencies) {
  return async (query: ListTribeRoundQuery): Promise<TribeRoundResult> => {
    const normalizedQuery = {
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
