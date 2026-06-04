import type {
  TribeRoundResult,
  TribeRoundLikersResult,
  TribeRoundRepliesResult,
  TribeRoundSharedDataResult,
  TribeRoundViewerStateResult,
} from "@/src/modules/messages/application/results/tribe-round-result";

export type ListTribeRoundQuery = {
  channelSlug?: string | null;
  page?: number;
  tribeSlug: string;
  viewerId: string;
};

export type ListTribeRoundSharedDataQuery = ListTribeRoundQuery;

export type ListMessageRepliesQuery = {
  messageId: string;
  tribeSlug: string;
  viewerId: string;
};

export type ListMessageLikersQuery = {
  messageId: string;
  tribeSlug: string;
  viewerId: string;
};

export interface MessageRoundReadRepository {
  listByTribeSlug(query: ListTribeRoundQuery): Promise<TribeRoundResult>;
  listLikersByMessageId(
    query: ListMessageLikersQuery
  ): Promise<TribeRoundLikersResult>;
  listRepliesByMessageId(
    query: ListMessageRepliesQuery
  ): Promise<TribeRoundRepliesResult>;
  listSharedDataByTribeSlug(
    query: ListTribeRoundSharedDataQuery
  ): Promise<TribeRoundSharedDataResult>;
  listViewerStateByTribeSlug(
    query: ListTribeRoundQuery
  ): Promise<TribeRoundViewerStateResult>;
}
