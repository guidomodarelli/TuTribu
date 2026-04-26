import type {
  CommunityFeedAuthorResult,
  CommunityFeedCommentResult,
  CommunityFeedPostResult,
  PostAuthorRole,
} from "@/src/modules/posts/application/results/community-feed-result";
import { POST_AUTHOR_ROLE } from "@/src/modules/posts/constants/post-feed";

const POST_FEED_DEFAULTS = {
  authorFallbackPartCount: 2,
  unknownAuthorFallback: "??",
  unknownAuthorName: "Miembro",
} as const;

export type CommunityFeedAuthorProjection = {
  id: string;
  image: string | null;
  name: string | null;
  role: string | null;
};

export type CommunityFeedCommentProjection = {
  author: CommunityFeedAuthorProjection;
  content: string;
  createdAt: Date | string;
  id: string;
};

export type CommunityFeedPostProjection = {
  author: CommunityFeedAuthorProjection;
  content: string;
  createdAt: Date | string;
  id: string;
  likedByViewer: boolean;
  likeCount: number;
  title: string | null;
};

export function formatPostDateTimeValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function createAvatarFallback(name: string): string {
  const fallback = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, POST_FEED_DEFAULTS.authorFallbackPartCount)
    .map((namePart) => namePart.charAt(0).toUpperCase())
    .join("");

  return fallback || POST_FEED_DEFAULTS.unknownAuthorFallback;
}

export function normalizeAuthorRole(role: string | null): PostAuthorRole {
  if (
    role === POST_AUTHOR_ROLE.owner ||
    role === POST_AUTHOR_ROLE.admin ||
    role === POST_AUTHOR_ROLE.member
  ) {
    return role;
  }

  return POST_AUTHOR_ROLE.member;
}

export function createCommunityFeedAuthor({
  id,
  image,
  name,
  role,
}: CommunityFeedAuthorProjection): CommunityFeedAuthorResult {
  const safeName = name || POST_FEED_DEFAULTS.unknownAuthorName;

  return {
    avatarFallback: createAvatarFallback(safeName),
    id,
    image,
    name: safeName,
    role: normalizeAuthorRole(role),
  };
}

export function createCommunityFeedComment({
  author,
  content,
  createdAt,
  id,
}: CommunityFeedCommentProjection): CommunityFeedCommentResult {
  return {
    author: createCommunityFeedAuthor(author),
    content,
    createdAt: formatPostDateTimeValue(createdAt),
    id,
  };
}

export function createCommunityFeedPost({
  author,
  content,
  createdAt,
  id,
  likedByViewer,
  likeCount,
  title,
}: CommunityFeedPostProjection): CommunityFeedPostResult {
  return {
    author: createCommunityFeedAuthor(author),
    comments: [],
    content,
    createdAt: formatPostDateTimeValue(createdAt),
    id,
    likedByViewer,
    likeCount,
    title,
  };
}
