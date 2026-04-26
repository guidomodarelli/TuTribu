export const COMMUNITY_POST_CONTENT = {
  maxLength: 2000,
  minLength: 1,
} as const;

export const COMMUNITY_POST_TITLE = {
  maxLength: 120,
  minLength: 1,
} as const;

export const POST_COMMENT_CONTENT = {
  maxLength: 1000,
  minLength: 1,
} as const;

export const POST_AUTHOR_ROLE = {
  admin: "admin",
  member: "member",
  owner: "owner",
} as const;

export const POST_MEMBERSHIP_STATUS = {
  active: "active",
  blocked: "blocked",
  muted: "muted",
} as const;

export const POST_REACTION_TYPE = {
  like: "like",
} as const;

export const POST_MUTATION_STATUS = {
  created: "created",
  forbidden: "forbidden",
  invalidCategory: "invalid_category",
  invalidContent: "invalid_content",
  liked: "liked",
  notFound: "not_found",
  unliked: "unliked",
} as const;

export const POST_CATEGORY_ACCESS_SCOPE = {
  members: "members",
} as const;

export const POST_CATEGORY_MUTATION_STATUS = {
  categoryHasPosts: "category_has_posts",
  created: "created",
  deleted: "deleted",
  duplicateSlug: "duplicate_slug",
  forbidden: "forbidden",
  invalidCategory: "invalid_category",
  invalidName: "invalid_name",
  lastCategory: "last_category",
  movedAndDeleted: "moved_and_deleted",
  notFound: "not_found",
  updated: "updated",
} as const;

export const COMMUNITY_POST_CATEGORY_NAME = {
  maxLength: 80,
  minLength: 1,
} as const;

export const COMMUNITY_POST_CATEGORY_EMOJI = {
  maxLength: 8,
  minLength: 1,
} as const;

export const DEFAULT_COMMUNITY_POST_CATEGORIES = [
  {
    emoji: "💬",
    name: "General",
    slug: "general",
    sortOrder: 20,
  },
] as const;
