import type {
  TribeStoryResult,
  TribeStoryStatsResult,
} from "@/src/modules/tribes/application/results/tribe-story-result";
import type {
  GetTribeStoryQuery,
  SaveTribeStoryCommand,
  SaveTribeStoryMediaItem,
  TribeStoryRepository,
  TribeStorySaveResult,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import {
  normalizeNullableText,
  normalizeText,
} from "@/src/modules/shared/application/validation/text-normalization";

type TribeStoryDependencies = {
  tribeStoryRepository: TribeStoryRepository;
};

function normalizeMediaItems(
  media: SaveTribeStoryMediaItem[]
): SaveTribeStoryMediaItem[] {
  return media.map((mediaItem, mediaIndex) => ({
    externalVideoId: normalizeNullableText(mediaItem.externalVideoId),
    mediaType: mediaItem.mediaType,
    sortOrder: mediaIndex,
    url: normalizeNullableText(mediaItem.url),
    videoProvider: normalizeNullableText(mediaItem.videoProvider),
  }));
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

export function getTribeStoryStats({
  tribeStoryRepository,
}: TribeStoryDependencies) {
  return async (
    query: GetTribeStoryQuery
  ): Promise<TribeStoryStatsResult | null> =>
    tribeStoryRepository.getStatsByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function getTribeStoryOnlineMembers({
  tribeStoryRepository,
}: TribeStoryDependencies) {
  return async (query: GetTribeStoryQuery) =>
    tribeStoryRepository.listOnlineMembersByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function listPublicTribeStorySlugs({
  tribeStoryRepository,
}: TribeStoryDependencies) {
  return async (): Promise<string[]> =>
    tribeStoryRepository.listPublicStorySlugs();
}

export function saveTribeStory({
  tribeStoryRepository,
}: TribeStoryDependencies) {
  return async (
    command: SaveTribeStoryCommand
  ): Promise<TribeStorySaveResult> =>
    tribeStoryRepository.save({
      content: normalizeText(command.content),
      media: normalizeMediaItems(command.media),
      tribeSlug: normalizeText(command.tribeSlug),
      websiteUrl: normalizeNullableText(command.websiteUrl),
    });
}
