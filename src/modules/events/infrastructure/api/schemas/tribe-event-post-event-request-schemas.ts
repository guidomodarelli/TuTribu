import { z } from "zod";

import type { TribeEventMaterialInput } from "@/src/modules/events/application/commands/tribe-event-command";
import {
  TRIBE_EVENT_OCCURRENCE_REACTION,
  TRIBE_EVENT_POST_EVENT_LIMIT,
} from "@/src/modules/events/constants/tribe-event-post-event";
import {
  createOptionalTextFieldSchema,
  createTribeEventInstantSchema,
  tribeSlugParamSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-fields";
import { TRIBE_EVENT_INPUT_ISSUE } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-issue";

/**
 * Input contracts of the post-event routes of one occurrence:
 * `.../events/[eventId]/post-event` (GET, PUT), `.../reaction` (PUT,
 * DELETE), `.../comments` (GET, POST), and `.../events/comments/[commentId]`
 * (DELETE). Params of the event routes reuse `tribeEventRouteParamsSchema`.
 * Whether the instant is a real slot, whether the occurrence finished, and
 * whether the recording URL belongs to a supported provider are business
 * rules of the use cases.
 */

const occurrenceStartSchema = createTribeEventInstantSchema(
  TRIBE_EVENT_INPUT_ISSUE.invalidOccurrenceReference
);

/**
 * `?occurrence=` (original start) of the post-event read and delete routes.
 * Routes without query reuse `tribeEventEmptyQuerySchema`.
 */
export const tribeEventPostEventQuerySchema = z.object({
  occurrence: occurrenceStartSchema,
});

const httpUrlSchema = z
  .url({
    error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials,
    protocol: /^https?$/,
  })
  .max(TRIBE_EVENT_POST_EVENT_LIMIT.urlMaxLength, {
    error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials,
  });

const materialSchema = z.object(
  {
    title: z
      .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials })
      .trim()
      .min(1, { error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials })
      .max(TRIBE_EVENT_POST_EVENT_LIMIT.materialTitleMaxLength, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials,
      }),
    url: z
      .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials })
      .trim()
      .pipe(httpUrlSchema),
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials }
) satisfies z.ZodType<TribeEventMaterialInput, unknown>;

/**
 * Body of `PUT .../post-event`: the recording link (empty or null removes
 * it) and the full list of materials, in display order.
 */
export const tribeEventPostEventBodySchema = z.object(
  {
    materials: z
      .array(materialSchema, { error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials })
      .max(TRIBE_EVENT_POST_EVENT_LIMIT.materialsMax, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidMaterials,
      }),
    occurrenceStartsAt: occurrenceStartSchema,
    recordingUrl: createOptionalTextFieldSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidRecording,
      z
        .url({ error: TRIBE_EVENT_INPUT_ISSUE.invalidRecording, protocol: /^https?$/ })
        .max(TRIBE_EVENT_POST_EVENT_LIMIT.urlMaxLength, {
          error: TRIBE_EVENT_INPUT_ISSUE.invalidRecording,
        })
    ),
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidInput }
);

export type TribeEventPostEventRequestBody = z.input<typeof tribeEventPostEventBodySchema>;

/**
 * Body of `PUT .../reaction`.
 */
export const tribeEventReactionBodySchema = z.object(
  {
    occurrenceStartsAt: occurrenceStartSchema,
    reaction: z.enum(TRIBE_EVENT_OCCURRENCE_REACTION, {
      error: TRIBE_EVENT_INPUT_ISSUE.invalidReaction,
    }),
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidReaction }
);

export type TribeEventReactionRequestBody = z.input<typeof tribeEventReactionBodySchema>;

/**
 * Body of `POST .../comments`.
 */
export const tribeEventCommentBodySchema = z.object(
  {
    content: z
      .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidComment })
      .trim()
      .min(1, { error: TRIBE_EVENT_INPUT_ISSUE.invalidComment })
      .max(TRIBE_EVENT_POST_EVENT_LIMIT.commentMaxLength, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidComment,
      }),
    occurrenceStartsAt: occurrenceStartSchema,
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidComment }
);

export type TribeEventCommentRequestBody = z.input<typeof tribeEventCommentBodySchema>;

/**
 * Params of `DELETE .../events/comments/[commentId]`.
 */
export const tribeEventCommentRouteParamsSchema = z.object({
  commentId: z.guid({ error: TRIBE_EVENT_INPUT_ISSUE.invalidCommentReference }),
  slug: tribeSlugParamSchema,
});
