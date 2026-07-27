import type {
  TribeStoryMediaItem,
  TribeStoryStats,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";

export type TribeStoryMediaResult = TribeStoryMediaItem;

export type TribeStoryResult = {
  content: string;
  media: TribeStoryMediaResult[];
  websiteUrl: string | null;
};

export type TribeStoryStatsResult = TribeStoryStats;
