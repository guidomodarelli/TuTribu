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

/** State the story free-join form keeps after a submit; a successful join redirects instead. */
export type TribeFreeJoinFormStatus = "failed" | "forbidden" | "idle";

export const TRIBE_FREE_JOIN_FORM_STATUS = {
  /** The join could not be completed (unexpected failure): the visitor can retry. */
  failed: "failed",
  /** The tribe no longer admits this account through the free join. */
  forbidden: "forbidden",
  idle: "idle",
} as const satisfies Record<string, TribeFreeJoinFormStatus>;

export type TribeFreeJoinFormState = { status: TribeFreeJoinFormStatus };

export const TRIBE_FREE_JOIN_FORM_INITIAL_STATE: TribeFreeJoinFormState = {
  status: TRIBE_FREE_JOIN_FORM_STATUS.idle,
};

/** `tribe_members.joined_via` of the basic academy admission. */
export const TRIBE_MEMBER_ACADEMY_ADMISSION_SOURCE = "academy_admission";
