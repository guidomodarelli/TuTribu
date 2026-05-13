import type {
  TribeRoundResult,
  TribeRoundSharedDataResult,
  TribeRoundViewerStateResult,
} from "@/src/modules/messages/application/results/tribe-round-result";

export type ListTribeRoundQuery = {
  tribeSlug: string;
  viewerId: string;
};

export type ListTribeRoundSharedDataQuery = ListTribeRoundQuery;

export interface MessageRoundReadRepository {
  listByTribeSlug(query: ListTribeRoundQuery): Promise<TribeRoundResult>;
  listSharedDataByTribeSlug(
    query: ListTribeRoundSharedDataQuery
  ): Promise<TribeRoundSharedDataResult>;
  listViewerStateByTribeSlug(
    query: ListTribeRoundQuery
  ): Promise<TribeRoundViewerStateResult>;
}
