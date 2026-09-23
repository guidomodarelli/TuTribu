import { z } from "zod";

import type { TribeEventProposalInput } from "@/src/modules/events/application/commands/tribe-event-command";
import {
  TRIBE_EVENT_DEFAULT_TYPE,
  TRIBE_EVENT_FIELD_LIMIT,
  TRIBE_EVENT_PROPOSAL_DURATION,
  TRIBE_EVENT_PROPOSAL_LIMIT,
  TRIBE_EVENT_PROPOSAL_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import {
  createEventTypeFieldSchema,
  createOptionalTextFieldSchema,
  createTribeEventInstantSchema,
  tribeEventMonthSchema,
  tribeEventProposalIdParamSchema,
  tribeSlugParamSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-fields";
import { TRIBE_EVENT_INPUT_ISSUE } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-issue";

/**
 * Input contracts of `app/api/tribes/[slug]/events/proposals/**`.
 */

export const tribeEventProposalRouteParamsSchema = z.object({
  proposalId: tribeEventProposalIdParamSchema,
  slug: tribeSlugParamSchema,
});

/**
 * Body of `POST .../proposals`: the reduced form (title, start, duration,
 * description, type).
 */
export const tribeEventProposalBodySchema = z.object(
  {
    description: createOptionalTextFieldSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidProposal,
      z.string().max(TRIBE_EVENT_FIELD_LIMIT.descriptionMaxLength, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal,
      })
    ),
    durationMinutes: z
      .int({ error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal })
      .min(TRIBE_EVENT_PROPOSAL_DURATION.minMinutes, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal,
      })
      .max(TRIBE_EVENT_PROPOSAL_DURATION.maxMinutes, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal,
      }),
    eventType: createEventTypeFieldSchema(TRIBE_EVENT_DEFAULT_TYPE),
    startsAt: z
      .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal })
      .trim()
      .min(1, { error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal })
      .pipe(createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidDate)),
    title: z
      .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal })
      .trim()
      .min(1, { error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal })
      .max(TRIBE_EVENT_FIELD_LIMIT.titleMaxLength, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal,
      }),
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal }
) satisfies z.ZodType<TribeEventProposalInput>;

export type TribeEventProposalRequestBody = z.input<typeof tribeEventProposalBodySchema>;

/**
 * Decisions `PATCH .../proposals/[proposalId]` accepts. Approval has its own
 * endpoint because it carries the whole event.
 */
const PROPOSAL_DECISION = {
  rejected: TRIBE_EVENT_PROPOSAL_STATUS.rejected,
  withdrawn: TRIBE_EVENT_PROPOSAL_STATUS.withdrawn,
} as const;

/**
 * Body of `PATCH .../proposals/[proposalId]`: a manager rejects (with an
 * optional note for the author) or the author withdraws.
 */
export const tribeEventProposalDecisionBodySchema = z.object(
  {
    decision: z.enum(PROPOSAL_DECISION, { error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal }),
    reviewNote: createOptionalTextFieldSchema(
      TRIBE_EVENT_INPUT_ISSUE.invalidReviewNote,
      z.string().max(TRIBE_EVENT_PROPOSAL_LIMIT.reviewNoteMaxLength, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidReviewNote,
      })
    ),
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidProposal }
);

export type TribeEventProposalDecisionRequestBody = z.input<
  typeof tribeEventProposalDecisionBodySchema
>;

/**
 * `?month=` of the approval endpoint (visible month to answer with).
 */
export const tribeEventProposalApprovalQuerySchema = z.object({
  month: tribeEventMonthSchema.optional(),
});
