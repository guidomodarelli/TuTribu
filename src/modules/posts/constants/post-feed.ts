export const COMMUNITY_POST_CONTENT = {
  maxLength: 2000,
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
  invalidContent: "invalid_content",
  liked: "liked",
  notFound: "not_found",
  unliked: "unliked",
} as const;
