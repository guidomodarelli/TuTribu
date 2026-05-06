import type {
  TribeFeedAuthorResult,
  TribeFeedCommentResult,
  TribeFeedPostResult,
  TribeChannelResult,
  PostAuthorRole,
} from "@/src/modules/posts/application/results/tribe-feed-result";
import {
  POST_AUTHOR_ROLE,
  TRIBE_CHANNEL_ACCESS_SCOPE,
} from "@/src/modules/posts/constants/post-feed";

const POST_FEED_DEFAULTS = {
  authorFallbackPartCount: 2,
  unknownAuthorFallback: "??",
  unknownAuthorName: "Integrante",
} as const;

export type TribeFeedAuthorProjection = {
  id: string;
  image: string | null;
  name: string | null;
  role: string | null;
};

export type TribeFeedCommentProjection = {
  author: TribeFeedAuthorProjection;
  content: string;
  createdAt: Date | string;
  id: string;
};

export type TribeFeedPostProjection = {
  author: TribeFeedAuthorProjection;
  channel: TribeChannelProjection;
  content: string;
  createdAt: Date | string;
  id: string;
  likedByViewer: boolean;
  likeCount: number;
  title: string | null;
};

export type TribeChannelProjection = {
  accessScope: string | null;
  emoji: string | null;
  id: string;
  name: string | null;
  slug: string | null;
  sortOrder: number | string | null;
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
    role === POST_AUTHOR_ROLE.leader ||
    role === POST_AUTHOR_ROLE.guardian ||
    role === POST_AUTHOR_ROLE.tribemate
  ) {
    return role;
  }

  return POST_AUTHOR_ROLE.tribemate;
}

export function createTribeFeedAuthor({
  id,
  image,
  name,
  role,
}: TribeFeedAuthorProjection): TribeFeedAuthorResult {
  const safeName = name || POST_FEED_DEFAULTS.unknownAuthorName;

  return {
    avatarFallback: createAvatarFallback(safeName),
    id,
    image,
    name: safeName,
    role: normalizeAuthorRole(role),
  };
}

export function createTribeFeedComment({
  author,
  content,
  createdAt,
  id,
}: TribeFeedCommentProjection): TribeFeedCommentResult {
  return {
    author: createTribeFeedAuthor(author),
    content,
    createdAt: formatPostDateTimeValue(createdAt),
    id,
  };
}

export function createTribeChannel({
  accessScope,
  emoji,
  id,
  name,
  slug,
  sortOrder,
}: TribeChannelProjection): TribeChannelResult {
  return {
    accessScope:
      accessScope === TRIBE_CHANNEL_ACCESS_SCOPE.tribemates
        ? accessScope
        : TRIBE_CHANNEL_ACCESS_SCOPE.tribemates,
    emoji: emoji || "",
    id,
    name: name || "",
    slug: slug || "",
    sortOrder: Number(sortOrder ?? 0),
  };
}

export function createTribeFeedPost({
  author,
  channel,
  content,
  createdAt,
  id,
  likedByViewer,
  likeCount,
  title,
}: TribeFeedPostProjection): TribeFeedPostResult {
  return {
    author: createTribeFeedAuthor(author),
    channel: createTribeChannel(channel),
    comments: [],
    content,
    createdAt: formatPostDateTimeValue(createdAt),
    id,
    likedByViewer,
    likeCount,
    title,
  };
}
