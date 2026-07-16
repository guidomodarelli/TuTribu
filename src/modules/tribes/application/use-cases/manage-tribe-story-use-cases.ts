import type { TribeStoryResult } from "@/src/modules/tribes/application/results/tribe-story-result";
import type {
  GetTribeStoryQuery,
  SaveTribeStoryCommand,
  TribeStoryRepository,
  TribeStorySaveResult,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";

type TribeStoryDependencies = {
  tribeStoryRepository: TribeStoryRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

export function getTribeStory({
  tribeStoryRepository,
}: TribeStoryDependencies) {
  return async (
    query: GetTribeStoryQuery
  ): Promise<TribeStoryResult | null> =>
    tribeStoryRepository.getByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function saveTribeStory({
  tribeStoryRepository,
}: TribeStoryDependencies) {
  return async (
    command: SaveTribeStoryCommand
  ): Promise<TribeStorySaveResult> =>
    tribeStoryRepository.save({
      content: normalizeText(command.content),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
