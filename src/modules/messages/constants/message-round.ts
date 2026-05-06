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

export const MESSAGE_MUTATION_STATUS = {
  created: "created",
  forbidden: "forbidden",
  invalidChannel: "invalid_channel",
  invalidContent: "invalid_content",
  liked: "liked",
  notFound: "not_found",
  unliked: "unliked",
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
  maxLength: 80,
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
