export const TRIBE_MESSAGE_CONTENT = {
  maxLength: 2000,
  minLength: 1,
} as const;

export const TRIBE_MESSAGE_TITLE = {
  maxLength: 120,
  minLength: 1,
} as const;

export const MESSAGE_REPLY_CONTENT = {
  maxLength: 1000,
  minLength: 1,
} as const;

export const MESSAGE_POLL_OPTION_TEXT = {
  maxLength: 80,
  minLength: 1,
} as const;

export const MESSAGE_POLL_OPTIONS = {
  maxCount: 10,
  minCount: 2,
} as const;

export const MESSAGE_IMAGES = {
  maxAltTextLength: 160,
  maxCount: 4,
} as const;

export const MESSAGE_IMAGE_STATUS = {
  attached: "attached",
  deleted: "deleted",
  draft: "draft",
  pendingDelete: "pending_delete",
} as const;

export const MESSAGE_IMAGE_PREPARATION_STATUS = {
  ready: "ready",
} as const;

export const MESSAGE_AUTHOR_ROLE = {
  guardian: "guardian",
  leader: "leader",
  tribemate: "tribemate",
} as const;

export const MESSAGE_MEMBERSHIP_STATUS = {
  active: "active",
  blocked: "blocked",
  muted: "muted",
} as const;

export const MESSAGE_REACTION_TYPE = {
  like: "like",
} as const;

/**
 * Maximum number of likers fetched and shown in the message like HoverCard
 * before collapsing the rest into the "y otros X..." row.
 */
export const MESSAGE_LIKERS_PREVIEW_LIMIT = 7;

export const MESSAGE_POLL_STATUS = {
  closed: "closed",
  open: "open",
} as const;

/**
 * Scale used to turn a vote ratio into a 0-100 poll percentage.
 */
export const MESSAGE_POLL_PERCENTAGE_SCALE = 100;

export const PINNED_TRIBE_MESSAGES_LIMIT = 3;

export const TRIBE_ROUND_PAGE_SIZE = 15;

export const MESSAGE_MUTATION_STATUS = {
  closed: "closed",
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  invalidChannel: "invalid_channel",
  invalidContent: "invalid_content",
  invalidImage: "invalid_image",
  invalidPoll: "invalid_poll",
  invalidVideoUrl: "invalid_video_url",
  liked: "liked",
  notFound: "not_found",
  pinLimitReached: "pin_limit_reached",
  pinned: "pinned",
  pollHasVotes: "poll_has_votes",
  pollMissing: "poll_missing",
  reopened: "reopened",
  unliked: "unliked",
  unpinned: "unpinned",
  updated: "updated",
  voted: "voted",
} as const;

export const TRIBE_CHANNEL_ACCESS_SCOPE = {
  tribemates: "tribemates",
} as const;

export const TRIBE_CHANNEL_MUTATION_STATUS = {
  channelHasMessages: "channel_has_messages",
  created: "created",
  deleted: "deleted",
  duplicateSlug: "duplicate_slug",
  forbidden: "forbidden",
  invalidChannel: "invalid_channel",
  invalidName: "invalid_name",
  lastChannel: "last_channel",
  movedAndDeleted: "moved_and_deleted",
  notFound: "not_found",
  updated: "updated",
} as const;

export const TRIBE_CHANNEL_NAME = {
  maxLength: 30,
  minLength: 1,
} as const;

export const TRIBE_CHANNEL_EMOJI = {
  maxLength: 8,
  minLength: 1,
} as const;

export const DEFAULT_TRIBE_CHANNELS = [
  {
    emoji: "🔥",
    name: "Ronda",
    slug: "ronda",
    sortOrder: 20,
  },
] as const;
