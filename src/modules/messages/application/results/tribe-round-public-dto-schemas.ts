import { z } from "zod";

import type {
  MessageFileResult,
  MessageMediaResult,
  MessagePollResult,
  TribeChannelResult,
  TribeRoundAuthorResult,
  TribeRoundMessageResult,
  TribeRoundPaginationResult,
  TribeRoundPermissionsResult,
  TribeRoundReplyResult,
  TribeRoundResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import {
  MESSAGE_AUTHOR_ROLE,
  MESSAGE_MEDIA_KIND,
  TRIBE_CHANNEL_ACCESS_SCOPE,
} from "@/src/modules/messages/constants/message-round";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Runtime contracts (allowlists) of the public tribe round DTOs: the JSON body
 * of `GET /api/tribes/[slug]/messages` and the round the tribe page hands to
 * the client `TribeRound`. `z.object` strips unknown keys, so the parsed value
 * is exactly what leaves the server; the browser adapter parses the same
 * schema with `safeParse` before using a response.
 */

const instantSchema = z.iso.datetime({ offset: true });
const countSchema = z.int().nonnegative();

const tribeChannelSchema = z.object({
  accessScope: z.enum(TRIBE_CHANNEL_ACCESS_SCOPE),
  emoji: z.string(),
  id: z.string().min(1),
  name: z.string(),
  slug: z.string().min(1),
  sortOrder: z.number(),
}) satisfies z.ZodType<TribeChannelResult>;

const tribeRoundAuthorSchema = z.object({
  avatarFallback: z.string(),
  id: z.string().min(1),
  image: z.string().nullable(),
  name: z.string(),
  role: z.enum(MESSAGE_AUTHOR_ROLE),
}) satisfies z.ZodType<TribeRoundAuthorResult>;

const tribeRoundReplySchema = z.object({
  author: tribeRoundAuthorSchema,
  content: z.string(),
  createdAt: instantSchema,
  id: z.string().min(1),
}) satisfies z.ZodType<TribeRoundReplyResult>;

const messagePollSchema = z.object({
  allowMultipleVotes: z.boolean(),
  id: z.string().min(1),
  options: z.array(
    z.object({
      id: z.string().min(1),
      percentage: z.number(),
      selectedByViewer: z.boolean(),
      text: z.string(),
      voteCount: countSchema,
    })
  ),
  totalVoteCount: countSchema,
  viewerHasVoted: z.boolean(),
}) satisfies z.ZodType<MessagePollResult>;

const messageMediaSchema = z.discriminatedUnion("kind", [
  z.object({
    altText: z.string(),
    id: z.string().min(1),
    kind: z.literal(MESSAGE_MEDIA_KIND.image),
    sortOrder: z.number(),
    url: z.string().min(1),
  }),
  z.object({
    externalId: z.string().min(1),
    id: z.string().min(1),
    kind: z.literal(MESSAGE_MEDIA_KIND.video),
    provider: z.enum(VIDEO_PROVIDER),
    sortOrder: z.number(),
    thumbnailResolved: z.boolean().optional(),
    thumbnailUrl: z.string().nullable().optional(),
  }),
]) satisfies z.ZodType<MessageMediaResult>;

const messageFileSchema = z.object({
  fileName: z.string(),
  fileSizeBytes: countSchema,
  id: z.string().min(1),
  mimeType: z.string(),
  sortOrder: z.number(),
}) satisfies z.ZodType<MessageFileResult>;

const tribeRoundMessageSchema = z.object({
  author: tribeRoundAuthorSchema,
  channel: tribeChannelSchema,
  content: z.string(),
  createdAt: instantSchema,
  files: z.array(messageFileSchema).optional(),
  hasLoadedReplies: z.boolean().optional(),
  id: z.string().min(1),
  isPinned: z.boolean().optional(),
  likeCount: countSchema,
  likedByViewer: z.boolean(),
  media: z.array(messageMediaSchema).optional(),
  permissions: z
    .object({
      canDelete: z.boolean(),
      canEdit: z.boolean(),
    })
    .optional(),
  pinnedAt: instantSchema.nullable().optional(),
  poll: messagePollSchema.nullable().optional(),
  replies: z.array(tribeRoundReplySchema),
  replyAuthorsPreview: z.array(tribeRoundAuthorSchema).optional(),
  replyCount: countSchema,
  title: z.string().nullable(),
}) satisfies z.ZodType<TribeRoundMessageResult>;

const tribeRoundPaginationSchema = z.object({
  currentPage: z.int().positive(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  pageSize: z.int().positive(),
}) satisfies z.ZodType<TribeRoundPaginationResult>;

const tribeRoundPermissionsSchema = z.object({
  canCreateMessage: z.boolean(),
  canEditMessageCreatedAt: z.boolean().optional(),
  canPinMessages: z.boolean().optional(),
  canReact: z.boolean(),
  canReply: z.boolean(),
}) satisfies z.ZodType<TribeRoundPermissionsResult>;

/** One page of the round as the client `TribeRound` renders it. */
export const tribeRoundSchema = z.object({
  activeChannelId: z.string().min(1).nullable(),
  channels: z.array(tribeChannelSchema),
  messages: z.array(tribeRoundMessageSchema),
  pagination: tribeRoundPaginationSchema,
  viewerPermissions: tribeRoundPermissionsSchema,
}) satisfies z.ZodType<TribeRoundResult>;

/** Body of `GET /api/tribes/[slug]/messages`. */
export const tribeRoundPageResponseSchema = z.object({
  round: tribeRoundSchema,
});

/** Body of every error response of the round routes: safe copy only. */
export const tribeRoundMessageResponseSchema = z.object({
  message: z.string(),
});

export type TribeRoundPageResponse = z.infer<typeof tribeRoundPageResponseSchema>;
