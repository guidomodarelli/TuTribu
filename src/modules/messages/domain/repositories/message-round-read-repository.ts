import type { TribeRoundResult } from "@/src/modules/messages/application/results/tribe-round-result";

export type ListTribeRoundQuery = {
  tribeSlug: string;
  viewerId: string;
};

export interface MessageRoundReadRepository {
  listByTribeSlug(query: ListTribeRoundQuery): Promise<TribeRoundResult>;
}
