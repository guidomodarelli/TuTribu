/** Guards the public DTOs of the commercial membership review at server/client and JSON boundaries. @module commercial-membership-review-schemas */
import { z } from "zod";
import { admissionPublicIdSchema } from "./admission-contract-fields";
import {
  COMMERCIAL_MEMBERSHIP_DECISION, COMMERCIAL_MEMBERSHIP_RECOVERY_STATUSES, COMMERCIAL_MEMBERSHIP_REJECTION, COMMERCIAL_MEMBERSHIP_REVIEW_ROLES,
  COMMERCIAL_MEMBERSHIP_REVIEW_STATUS, COMMERCIAL_MEMBERSHIP_REVIEW_STATUSES, COMMERCIAL_MEMBERSHIP_REVIEW_STATUS_REASONS,
} from "../../constants/commercial-membership-review";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { CommercialMembershipResolutionResult, CommercialMembershipReviewCase, CommercialMembershipReviewList } from "../../domain/entities/commercial-membership-review";

const recoveryStatusSchema = z.enum(COMMERCIAL_MEMBERSHIP_RECOVERY_STATUSES).nullable();

export const commercialMembershipReviewCaseSchema: z.ZodType<CommercialMembershipReviewCase> = z.object({
  memberId: z.uuid(),
  displayName: z.string().max(ADMISSION_LIMIT.internalMessageCharacters).nullable(),
  role: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_ROLES),
  status: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_STATUSES),
  statusReason: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_STATUS_REASONS),
  recoveryStatus: recoveryStatusSchema,
  joinedAt: z.iso.datetime({ offset: true }),
}).refine((item) => item.role === TRIBE_MEMBER_ROLE.guardian || item.recoveryStatus === null);

export const commercialMembershipReviewListSchema: z.ZodType<CommercialMembershipReviewList> = z.object({
  cases: z.array(commercialMembershipReviewCaseSchema),
  pendingCount: z.int().nonnegative(),
  resolvedCount: z.int().nonnegative(),
}).refine((list) => list.pendingCount >= list.cases.length && new Set(list.cases.map((item) => item.memberId)).size === list.cases.length);

/** The original confirmed result; a rejection is terminal and replayable like a decision. */
export const commercialMembershipResolutionResultSchema: z.ZodType<CommercialMembershipResolutionResult> = z.discriminatedUnion("status", [
  z.object({
    status: z.literal(COMMERCIAL_MEMBERSHIP_REVIEW_STATUS.resolved), memberId: admissionPublicIdSchema, decision: z.enum(COMMERCIAL_MEMBERSHIP_DECISION),
    resultingRole: z.literal(TRIBE_MEMBER_ROLE.tribemate), resultingStatus: z.enum([...COMMERCIAL_MEMBERSHIP_REVIEW_STATUSES, TRIBE_MEMBERSHIP_STATUS.removed]),
    resultingRecoveryStatus: recoveryStatusSchema, decidedAt: z.iso.datetime({ offset: true }),
  }).refine((result) => result.decision === COMMERCIAL_MEMBERSHIP_DECISION.retire
    ? result.resultingStatus === TRIBE_MEMBERSHIP_STATUS.removed
    : result.resultingRecoveryStatus === (result.decision === COMMERCIAL_MEMBERSHIP_DECISION.recoverActive ? TRIBE_MEMBERSHIP_STATUS.active : TRIBE_MEMBERSHIP_STATUS.muted)),
  z.object({ status: z.literal(COMMERCIAL_MEMBERSHIP_REVIEW_STATUS.rejected), memberId: admissionPublicIdSchema, reason: z.enum(COMMERCIAL_MEMBERSHIP_REJECTION) }),
]);
