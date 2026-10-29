import type {
  MessagePollResult,
  TribeRoundResult,
  TribeRoundLikersResult,
  TribeRoundRepliesResult,
  TribeRoundSharedDataResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import {
  applyTribeRoundViewerState,
  normalizeTribeRoundChannelSlug,
  normalizeTribeRoundPage,
} from "@/src/modules/messages/application/results/tribe-round-viewer-state";
import { TRIBE_ROUND_PAGE_SIZE } from "@/src/modules/messages/constants/message-round";
import type {
  ListMessageLikersQuery,
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

function applyViewerPollState(
  poll: MessagePollResult,
  selectedPollOptionIds: Set<string>
): MessagePollResult {
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

export function listTribeRound({
  listCachedTribeRoundSharedData,
  messageRoundReadRepository,
}: ListTribeRoundDependencies) {
  return async (query: ListTribeRoundQuery): Promise<TribeRoundResult> => {
    const normalizedQuery = {
      channelSlug: normalizeTribeRoundChannelSlug(query.channelSlug),
      page: normalizeTribeRoundPage(query.page),
      tribeSlug: query.tribeSlug.trim(),
      viewerId: query.viewerId,
    };
    const readSharedData =
      listCachedTribeRoundSharedData ??
      messageRoundReadRepository.listSharedDataByTribeSlug.bind(
        messageRoundReadRepository
      );
    const sharedData = await readSharedData(normalizedQuery);
    const viewerState =
      await messageRoundReadRepository.listViewerStateByTribeSlug(normalizedQuery);

    return applyTribeRoundViewerState(
      sharedData,
      viewerState,
      applyViewerPollState
    );
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

export function listMessageLikers({
  messageRoundReadRepository,
}: ListTribeRoundDependencies) {
  return async (
    query: ListMessageLikersQuery
  ): Promise<TribeRoundLikersResult> => {
    return messageRoundReadRepository.listLikersByMessageId({
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
