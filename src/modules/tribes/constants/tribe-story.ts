export const TRIBE_STORY_SAVE_STATUS = {
  forbidden: "forbidden",
  notFound: "not_found",
  updated: "updated",
} as const;

export const TRIBE_STORY_MEDIA_TYPE = {
  image: "image",
  video: "video",
} as const;

export const TRIBE_STORY_CONTENT_MAX_LENGTH = 10000;

export const TRIBE_STORY_MEDIA_MAX_ITEMS = 5;

export const TRIBE_MEMBER_FREE_OPEN_JOIN_SOURCE = "free_open_join";

export const TRIBE_FREE_JOIN_STATUS = {
  alreadyMember: "already_member",
  forbidden: "forbidden",
  joined: "joined",
} as const;

/** `tribe_members.joined_via` of the basic academy admission. */
export const TRIBE_MEMBER_ACADEMY_ADMISSION_SOURCE = "academy_admission";
