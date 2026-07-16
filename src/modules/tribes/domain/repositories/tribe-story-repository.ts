import type { TRIBE_STORY_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-story";

export type TribeStorySettings = {
  content: string;
};

export type TribeStorySaveStatus =
  | typeof TRIBE_STORY_SAVE_STATUS.forbidden
  | typeof TRIBE_STORY_SAVE_STATUS.notFound
  | typeof TRIBE_STORY_SAVE_STATUS.updated;

export type TribeStorySaveResult = {
  status: TribeStorySaveStatus;
  story: TribeStorySettings | null;
};

export type GetTribeStoryQuery = {
  tribeSlug: string;
};

export type SaveTribeStoryCommand = {
  content: string;
  tribeSlug: string;
};

export type TribeStoryRepository = {
  getByTribeSlug(query: GetTribeStoryQuery): Promise<TribeStorySettings | null>;
  save(command: SaveTribeStoryCommand): Promise<TribeStorySaveResult>;
};
