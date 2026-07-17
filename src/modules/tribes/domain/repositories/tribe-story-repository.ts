import type {
  TRIBE_STORY_MEDIA_TYPE,
  TRIBE_STORY_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-story";

export type TribeStoryMediaType =
  (typeof TRIBE_STORY_MEDIA_TYPE)[keyof typeof TRIBE_STORY_MEDIA_TYPE];

export type TribeStoryMediaItem = {
  externalVideoId: string | null;
  id: string;
  mediaType: TribeStoryMediaType;
  sortOrder: number;
  url: string | null;
  videoProvider: string | null;
};

export type TribeStorySettings = {
  content: string;
  coverUrl: string | null;
  logoUrl: string | null;
  media: TribeStoryMediaItem[];
  websiteUrl: string | null;
};

export type TribeStoryStats = {
  adminCount: number;
  createdAt: string;
  memberCount: number;
  name: string;
  onlineCount: number;
  openFreeJoinAvailable: boolean;
  openFreeJoinEnabled: boolean;
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

export type SaveTribeStoryMediaItem = {
  externalVideoId: string | null;
  mediaType: TribeStoryMediaType;
  sortOrder: number;
  url: string | null;
  videoProvider: string | null;
};

export type SaveTribeStoryCommand = {
  content: string;
  coverUrl: string | null;
  logoUrl: string | null;
  media: SaveTribeStoryMediaItem[];
  openFreeJoinEnabled: boolean;
  tribeSlug: string;
  websiteUrl: string | null;
};

export type TribeStoryOnlineMember = {
  image: string | null;
  name: string;
};

export type TribeStoryRepository = {
  getByTribeSlug(query: GetTribeStoryQuery): Promise<TribeStorySettings | null>;
  getStatsByTribeSlug(query: GetTribeStoryQuery): Promise<TribeStoryStats | null>;
  listOnlineMembersByTribeSlug(
    query: GetTribeStoryQuery
  ): Promise<TribeStoryOnlineMember[]>;
  listPublicStorySlugs(): Promise<string[]>;
  save(command: SaveTribeStoryCommand): Promise<TribeStorySaveResult>;
};
