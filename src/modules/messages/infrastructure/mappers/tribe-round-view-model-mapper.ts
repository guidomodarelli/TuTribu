import type {
  MessagePollResult,
  MessageFileResult,
  MessageMediaResult,
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
  files?: MessageFileResult[];
  id: string;
  isPinned?: boolean;
  likedByViewer: boolean;
  likeCount: number;
  media?: MessageMediaResult[];
  permissions?: NonNullable<TribeRoundMessageResult["permissions"]>;
  pinnedAt?: Date | string | null;
  poll?: MessagePollResult | null;
  replyAuthorsPreview?: TribeRoundAuthorProjection[];
  replyCount?: number;
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

/**
 * Canonical ISO 8601 instant for a message timestamp. Drizzle over
 * node-postgres keeps `timestamptz` as PostgreSQL text
 * (`2026-06-10 00:58:55.66666+00`), which the public round DTO rejects, so
 * both `Date` values and database text are normalized.
 *
 * @param value - Timestamp read from the database.
 * @returns The instant as `YYYY-MM-DDTHH:mm:ss.sssZ`.
 */
export function formatMessageDateTimeValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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
    emoji: emoji ?? "",
    id,
    name: name ?? "",
    slug: slug ?? "",
    sortOrder: Number(sortOrder ?? 0),
  };
}

export function createTribeRoundMessage({
  author,
  channel,
  content,
  createdAt,
  files = [],
  id,
  isPinned = false,
  likedByViewer,
  likeCount,
  media = [],
  permissions,
  pinnedAt = null,
  poll = null,
  replyAuthorsPreview = [],
  replyCount = 0,
  title,
}: TribeRoundMessageProjection): TribeRoundMessageResult {
  return {
    author: createTribeRoundAuthor(author),
    channel: createTribeChannel(channel),
    hasLoadedReplies: true,
    replies: [],
    content,
    createdAt: formatMessageDateTimeValue(createdAt),
    files,
    id,
    isPinned,
    likedByViewer,
    likeCount,
    media,
    permissions,
    pinnedAt: pinnedAt ? formatMessageDateTimeValue(pinnedAt) : null,
    poll,
    replyAuthorsPreview: replyAuthorsPreview.map(createTribeRoundAuthor),
    replyCount,
    title,
  };
}

/** Reply columns selected by the reply queries. */
export type TribeRoundReplyRow = {
  reply_author_id: string | null;
  reply_author_image: string | null;
  reply_author_name: string | null;
  reply_author_role: string | null;
  reply_content: string | null;
  reply_created_at: Date | string | null;
  reply_id: string | null;
};

/**
 * Maps a reply row when it carries every required column.
 *
 * @param row - Reply columns of one query row.
 * @returns The reply, or null when the row has no complete reply.
 */
export function createTribeRoundReplyFromRow(
  row: TribeRoundReplyRow
): TribeRoundReplyResult | null {
  if (
    !row.reply_id ||
    !row.reply_author_id ||
    !row.reply_content ||
    !row.reply_created_at
  ) {
    return null;
  }

  return createTribeRoundReply({
    id: row.reply_id,
    author: {
      id: row.reply_author_id,
      image: row.reply_author_image,
      name: row.reply_author_name,
      role: row.reply_author_role,
    },
    content: row.reply_content,
    createdAt: row.reply_created_at,
  });
}

/**
 * Maps the stored options of a poll nobody has voted yet, dropping incomplete rows.
 *
 * @param options - Stored option ids and texts.
 * @returns Options without votes or viewer selection.
 */
export function createUnvotedPollOptions(
  options: { id: string | null; text: string | null }[]
): MessagePollResult["options"] {
  return options
    .filter((option) => option.id && option.text)
    .map((option) => ({
      id: option.id ?? "",
      percentage: 0,
      selectedByViewer: false,
      text: option.text ?? "",
      voteCount: 0,
    }));
}
