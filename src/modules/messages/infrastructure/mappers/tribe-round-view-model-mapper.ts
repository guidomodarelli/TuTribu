import type {
  MessagePollResult,
  MessageImageResult,
  MessageVideoResult,
  TribeRoundAuthorResult,
  TribeRoundReplyResult,
  TribeRoundMessageResult,
  TribeChannelResult,
  MessageAuthorRole,
} from "@/src/modules/messages/application/results/tribe-round-result";
import {
  MESSAGE_AUTHOR_ROLE,
  TRIBE_CHANNEL_ACCESS_SCOPE,
} from "@/src/modules/messages/constants/message-round";

const POST_FEED_DEFAULTS = {
  authorFallbackPartCount: 2,
  unknownAuthorFallback: "??",
  unknownAuthorName: "Integrante",
} as const;

export type TribeRoundAuthorProjection = {
  id: string;
  image: string | null;
  name: string | null;
  role: string | null;
};

export type TribeRoundReplyProjection = {
  author: TribeRoundAuthorProjection;
  content: string;
  createdAt: Date | string;
  id: string;
};

export type TribeRoundMessageProjection = {
  author: TribeRoundAuthorProjection;
  channel: TribeChannelProjection;
  content: string;
  createdAt: Date | string;
  id: string;
  images?: MessageImageResult[];
  isPinned?: boolean;
  likedByViewer: boolean;
  likeCount: number;
  permissions?: TribeRoundMessageResult["permissions"];
  pinnedAt?: Date | string | null;
  poll?: MessagePollResult | null;
  replyAuthorsPreview?: TribeRoundAuthorProjection[];
  replyCount?: number;
  title: string | null;
  video?: MessageVideoResult | null;
};

export type TribeChannelProjection = {
  accessScope: string | null;
  emoji: string | null;
  id: string;
  name: string | null;
  slug: string | null;
  sortOrder: number | string | null;
};

export function formatMessageDateTimeValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function createAvatarFallback(name: string): string {
  const fallback = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, POST_FEED_DEFAULTS.authorFallbackPartCount)
    .map((namePart) => namePart.charAt(0).toUpperCase())
    .join("");

  return fallback || POST_FEED_DEFAULTS.unknownAuthorFallback;
}

function normalizeAuthorRole(role: string | null): MessageAuthorRole {
  if (
    role === MESSAGE_AUTHOR_ROLE.leader ||
    role === MESSAGE_AUTHOR_ROLE.guardian ||
    role === MESSAGE_AUTHOR_ROLE.tribemate
  ) {
    return role;
  }

  return MESSAGE_AUTHOR_ROLE.tribemate;
}

export function createTribeRoundAuthor({
  id,
  image,
  name,
  role,
}: TribeRoundAuthorProjection): TribeRoundAuthorResult {
  const safeName = name || POST_FEED_DEFAULTS.unknownAuthorName;

  return {
    avatarFallback: createAvatarFallback(safeName),
    id,
    image,
    name: safeName,
    role: normalizeAuthorRole(role),
  };
}

export function createTribeRoundReply({
  author,
  content,
  createdAt,
  id,
}: TribeRoundReplyProjection): TribeRoundReplyResult {
  return {
    author: createTribeRoundAuthor(author),
    content,
    createdAt: formatMessageDateTimeValue(createdAt),
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

export function createTribeRoundMessage({
  author,
  channel,
  content,
  createdAt,
  id,
  images = [],
  isPinned = false,
  likedByViewer,
  likeCount,
  permissions,
  pinnedAt = null,
  poll = null,
  replyAuthorsPreview = [],
  replyCount = 0,
  title,
  video = null,
}: TribeRoundMessageProjection): TribeRoundMessageResult {
  return {
    author: createTribeRoundAuthor(author),
    channel: createTribeChannel(channel),
    hasLoadedReplies: true,
    replies: [],
    content,
    createdAt: formatMessageDateTimeValue(createdAt),
    id,
    images,
    isPinned,
    likedByViewer,
    likeCount,
    permissions,
    pinnedAt: pinnedAt ? formatMessageDateTimeValue(pinnedAt) : null,
    poll,
    replyAuthorsPreview: replyAuthorsPreview.map(createTribeRoundAuthor),
    replyCount,
    title,
    video,
  };
}
