import { z } from "zod";

import type {
  TribeEventCommentResult,
  TribeEventConversationResult,
  TribeEventPostEventResult,
} from "@/src/modules/events/application/results/tribe-event-post-event-result";
import {
  TRIBE_EVENT_OCCURRENCE_REACTION,
  TRIBE_EVENT_POST_EVENT_LIMIT,
} from "@/src/modules/events/constants/tribe-event-post-event";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Runtime contracts (allowlists) of the post-event DTOs: JSON bodies of
 * `app/api/tribes/[slug]/events/[eventId]/post-event`, `/reaction`,
 * `/comments`, and `app/api/tribes/[slug]/events/comments/[commentId]`. The
 * browser adapter parses the same schemas with `safeParse` before using a
 * response.
 */

const instantSchema = z.iso.datetime({ offset: true });
const countSchema = z.int().nonnegative();
const webUrlSchema = z.url({ protocol: /^https?$/ }).max(TRIBE_EVENT_POST_EVENT_LIMIT.urlMaxLength);
const reactionSchema = z.enum(TRIBE_EVENT_OCCURRENCE_REACTION);

export const tribeEventReactionSummarySchema = z.object({
  counts: z.object({
    [TRIBE_EVENT_OCCURRENCE_REACTION.fire]: countSchema,
    [TRIBE_EVENT_OCCURRENCE_REACTION.neutral]: countSchema,
    [TRIBE_EVENT_OCCURRENCE_REACTION.thumbsUp]: countSchema,
  }),
  viewerReaction: reactionSchema.nullable(),
}) satisfies z.ZodType<TribeEventPostEventResult["reactions"]>;

const recordingSchema = z.object({
  embedUrl: z.url({ protocol: /^https$/ }),
  externalVideoId: z.string().min(1),
  provider: z.enum(VIDEO_PROVIDER),
  sourceUrl: webUrlSchema,
  thumbnailUrl: z.url({ protocol: /^https$/ }).nullable(),
});

const materialSchema = z.object({
  title: z.string().min(1),
  url: webUrlSchema,
});

/**
 * Post-event view of one occurrence. `canConvertToLesson` comes from the
 * courses module (course managers), composed by the route.
 */
export const tribeEventPostEventSchema = z.object({
  isCancelled: z.boolean(),
  isFinished: z.boolean(),
  materials: z.array(materialSchema),
  reactions: tribeEventReactionSummarySchema,
  recording: recordingSchema.nullable(),
  viewerPermissions: z.object({
    canConvertToLesson: z.boolean(),
    canManageResources: z.boolean(),
    canParticipate: z.boolean(),
  }),
}) satisfies z.ZodType<
  Omit<TribeEventPostEventResult, "viewerPermissions"> & {
    viewerPermissions: TribeEventPostEventResult["viewerPermissions"] & {
      canConvertToLesson: boolean;
    };
  }
>;

export type TribeEventPostEventView = z.infer<typeof tribeEventPostEventSchema>;

/**
 * `GET /post-event?occurrence=` body.
 */
export const tribeEventPostEventResponseSchema = z.object({
  postEvent: tribeEventPostEventSchema,
});

/**
 * `PUT /post-event` body: the saved resources and a safe message.
 */
export const tribeEventPostEventSaveResponseSchema = z.object({
  message: z.string(),
  postEvent: tribeEventPostEventSchema,
});

/**
 * `PUT` and `DELETE /reaction` body: the fresh counts.
 */
export const tribeEventReactionResponseSchema = z.object({
  reactions: tribeEventReactionSummarySchema,
});

export const tribeEventCommentSchema = z.object({
  authorImageUrl: z.string().nullable(),
  authorName: z.string(),
  canDelete: z.boolean(),
  content: z.string(),
  createdAt: instantSchema,
  id: z.uuid(),
}) satisfies z.ZodType<TribeEventCommentResult>;

/**
 * `GET /comments?occurrence=` body.
 */
export const tribeEventConversationResponseSchema = z.object({
  canComment: z.boolean(),
  comments: z.array(tribeEventCommentSchema),
}) satisfies z.ZodType<TribeEventConversationResult>;

/**
 * `POST /comments` body.
 */
export const tribeEventCommentResponseSchema = z.object({
  comment: tribeEventCommentSchema,
  message: z.string(),
});

export type TribeEventPostEventResponse = z.infer<typeof tribeEventPostEventResponseSchema>;
export type TribeEventPostEventSaveResponse = z.infer<typeof tribeEventPostEventSaveResponseSchema>;
export type TribeEventReactionResponse = z.infer<typeof tribeEventReactionResponseSchema>;
export type TribeEventConversationResponse = z.infer<typeof tribeEventConversationResponseSchema>;
export type TribeEventCommentResponse = z.infer<typeof tribeEventCommentResponseSchema>;
export type TribeEventComment = z.infer<typeof tribeEventCommentSchema>;
