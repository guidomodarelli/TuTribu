import type { TribeRoundResult } from "@/src/modules/messages/application/results/tribe-round-result";
import type {
  ListTribeRoundQuery,
  MessageRoundReadRepository,
} from "@/src/modules/messages/domain/repositories/message-round-read-repository";

type ListTribeRoundDependencies = {
  messageRoundReadRepository: MessageRoundReadRepository;
};

export function listTribeRound({
  messageRoundReadRepository,
}: ListTribeRoundDependencies) {
  return async (
    query: ListTribeRoundQuery
  ): Promise<TribeRoundResult> =>
    messageRoundReadRepository.listByTribeSlug({
      tribeSlug: query.tribeSlug.trim(),
      viewerId: query.viewerId,
    });
}
