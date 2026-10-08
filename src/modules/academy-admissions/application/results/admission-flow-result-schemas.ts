/** Defines audience-specific flow DTOs and confirmed result contracts. @module admission-flow-result-schemas */
import { z } from "zod";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_OUTCOME, ADMISSION_DENIAL_REASON, ADMISSION_EVIDENCE_KIND, ADMISSION_INVITATION_STATUS, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_OVERVIEW_STATE, ADMISSION_NEXT_ACTION, ADMISSION_PUBLIC_SOURCE, ADMISSION_DECISION, ADMISSION_BATCH_ITEM_STATUS, ADMISSION_BATCH_RESULT, ADMISSION_REVIEW_EVIDENCE_SOURCE, ADMISSION_REVIEW_ACCOUNT_SCOPE } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { admissionPublicIdSchema, admissionPublicVersionSchema, admissionPublicInstantSchema, admissionLocalHrefSchema, admissionMaskedContactSchema } from "./admission-contract-fields";
import { admissionContactOptionsSchema } from "./admission-contact-options-schema";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";

/** Own-request projection; reviewer/account ids, raw contacts and internal reasons are absent. */
export const admissionRequestSchema = z.object({
  id: admissionPublicIdSchema, status: z.enum(ADMISSION_REQUEST_STATUS), version: admissionPublicVersionSchema,
  submittedAt: admissionPublicInstantSchema, expiresAt: admissionPublicInstantSchema, source: z.enum(ADMISSION_PUBLIC_SOURCE),
  contact: admissionMaskedContactSchema.optional(), needsVerification: z.boolean(), eligibilityReasons: z.array(z.enum(ADMISSION_DENIAL_REASON)),
  externalMessage: z.string().max(ADMISSION_LIMIT.externalMessageCharacters).optional(), retryAllowedAt: admissionPublicInstantSchema.optional(),
});
/** Declared input carries no verification time; base and local evidence have disjoint scopes. */
const reviewEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(ADMISSION_EVIDENCE_KIND.none), verifiedAt: z.never().optional() }),
  z.object({ kind: z.literal(ADMISSION_EVIDENCE_KIND.declared), verifiedAt: z.never().optional() }),
  z.object({ kind: z.literal(ADMISSION_EVIDENCE_KIND.base), source: z.literal(ADMISSION_REVIEW_EVIDENCE_SOURCE.google), verifiedAt: admissionPublicInstantSchema, scope: z.literal(ADMISSION_REVIEW_ACCOUNT_SCOPE) }),
  z.object({ kind: z.literal(ADMISSION_EVIDENCE_KIND.local), source: z.literal(ADMISSION_REVIEW_EVIDENCE_SOURCE.localCode), verifiedAt: admissionPublicInstantSchema, scope: z.object({ tribeId: admissionPublicIdSchema, requestId: admissionPublicIdSchema, purpose: z.literal(ADMISSION_VERIFICATION_PURPOSE.admission) }) }),
]);
/** Reviewers see the constraints needed to decide, without an invitation's token, internal name or other recipient. */
const reviewRestrictionsSchema = z.object({ requiresAllowlist: z.boolean(), requiresExceptionReason: z.boolean(), invitation: z.object({ status: z.enum(ADMISSION_INVITATION_STATUS), requiresAllowlist: z.boolean(), authorizationRevoked: z.boolean(), recipientMatches: z.boolean(), expiresAt: admissionPublicInstantSchema.nullable() }).nullable() });
/** Only a current reviewer route may select this schema; audience never comes from query/body. */
export const admissionReviewSchema = admissionRequestSchema.extend({
  applicant: z.object({ id: z.string().min(1), name: z.string() }),
  rawContact: z.string().optional(), internalReason: z.string().max(ADMISSION_LIMIT.internalMessageCharacters).optional(),
  applicantMessage: z.string().max(ADMISSION_LIMIT.internalMessageCharacters).optional(),
  eligibleActions: z.array(z.enum(ADMISSION_DECISION)), evidence: reviewEvidenceSchema, restrictions: reviewRestrictionsSchema,
}).refine((review) => (!review.contact || review.contact.evidenceKind === review.evidence.kind)
  && (review.evidence.kind !== ADMISSION_EVIDENCE_KIND.local || review.evidence.scope.requestId === review.id)
  && (review.source !== ADMISSION_PUBLIC_SOURCE.personal || review.restrictions.invitation !== null));
/** Public policy summary omits list matches, exceptions and management-only data. */
const overviewPolicySchema = z.object({ mode: z.enum(ADMISSION_POLICY_MODE), contactType: z.enum(ADMISSION_CONTACT_TYPE), requiresAdditionalVerification: z.boolean(), isOpen: z.boolean(), version: admissionPublicVersionSchema });
/** Public/own overview can represent missing configuration without a fabricated version. */
export const admissionOverviewSchema = z.object({
  tribe: z.object({ slug: z.string().regex(TRIBE_SLUG_PATTERN), name: z.string(), accessModel: z.literal("academy") }),
  policy: overviewPolicySchema.nullable(), state: z.enum(ADMISSION_OVERVIEW_STATE), nextAction: z.enum(ADMISSION_NEXT_ACTION), safeMessage: z.string(), request: admissionRequestSchema.optional(), verification: admissionContactOptionsSchema.optional(),
}).refine((overview) => !overview.verification || overview.policy?.requiresAdditionalVerification === true && (overview.policy.contactType === ADMISSION_CONTACT_TYPE.email ? overview.verification.channel === MESSAGING_PUBLIC_CHANNEL.email : overview.verification.channel !== MESSAGING_PUBLIC_CHANNEL.email));
/** Legible membership states are preserved; a new admission cannot grant a privileged role. */
const legibleMembershipSchema = z.object({ status: z.enum([TRIBE_MEMBERSHIP_STATUS.active, TRIBE_MEMBERSHIP_STATUS.muted]), role: z.enum(TRIBE_MEMBER_ROLE) });
const outcomeFields = { operationId: admissionPublicIdSchema, safeMessage: z.string(), nextHref: admissionLocalHrefSchema.optional() };
/** Each success shape describes a confirmed outcome rather than a permissive optional-field bag. */
export const admissionOutcomeSchema = z.discriminatedUnion("outcome", [
  z.object({ ...outcomeFields, outcome: z.literal(ADMISSION_OUTCOME.pending), request: admissionRequestSchema.extend({ status: z.literal(ADMISSION_REQUEST_STATUS.pending) }) }),
  z.object({ ...outcomeFields, outcome: z.literal(ADMISSION_OUTCOME.admitted), membership: legibleMembershipSchema.extend({ role: z.literal(TRIBE_MEMBER_ROLE.tribemate) }) }),
  z.object({ ...outcomeFields, outcome: z.literal(ADMISSION_OUTCOME.alreadyMember), membership: legibleMembershipSchema }),
]);
/** A batch item reports its current committed version or a closed failed/unresolved reason. */
const batchItemSchema = z.object({ requestId: admissionPublicIdSchema, status: z.enum(ADMISSION_BATCH_ITEM_STATUS), version: admissionPublicVersionSchema.optional(), code: z.enum(ADMISSION_ERROR_CODE).optional(), safeMessage: z.string() });
/** Counts and summary must agree with every explicit selected item; partial progress cannot be invented. */
export const admissionBatchResultSchema = z.object({
  operationId: admissionPublicIdSchema, state: z.enum(OPERATION_STATE), result: z.enum(ADMISSION_BATCH_RESULT),
  completedCount: z.int().nonnegative(), failedCount: z.int().nonnegative(), unresolvedCount: z.int().nonnegative(),
  items: z.array(batchItemSchema).min(1).max(ADMISSION_LIMIT.batchRequestCount),
}).refine((batch) => {
  const completed = batch.items.filter((item) => item.status === ADMISSION_BATCH_ITEM_STATUS.approved || item.status === ADMISSION_BATCH_ITEM_STATUS.rejected || item.status === ADMISSION_BATCH_ITEM_STATUS.cancelled).length;
  const unresolved = batch.items.filter((item) => item.status === ADMISSION_BATCH_ITEM_STATUS.unresolved).length;
  const failed = batch.items.length - completed - unresolved;
  const expected = unresolved > 0 ? ADMISSION_BATCH_RESULT.incomplete : completed > 0 && failed > 0 ? ADMISSION_BATCH_RESULT.mixed : failed > 0 ? ADMISSION_BATCH_RESULT.allRejected : ADMISSION_BATCH_RESULT.allSucceeded;
  return new Set(batch.items.map((item) => item.requestId)).size === batch.items.length
    && batch.completedCount === completed && batch.failedCount === failed && batch.unresolvedCount === unresolved
    && batch.result === expected && batch.state === (unresolved > 0 ? OPERATION_STATE.started : OPERATION_STATE.completed)
    && batch.items.every((item) => completed > 0 && (item.status === ADMISSION_BATCH_ITEM_STATUS.approved || item.status === ADMISSION_BATCH_ITEM_STATUS.rejected || item.status === ADMISSION_BATCH_ITEM_STATUS.cancelled) ? item.version !== undefined : item.code !== undefined);
});

/**
 * Binds an operation response to its owner's actual committed DTO without exposing intent or a current-snapshot claim.
 * @param resultSchema - Allowlisted public schema selected by the authorized operation owner.
 * @returns Started/completed variants; started cannot carry an unconfirmed result.
 */
export function createAdmissionOperationStateSchema<Result>(resultSchema: z.ZodType<Result>) {
  return z.discriminatedUnion("state", [
    z.object({ state: z.literal(OPERATION_STATE.started), operationId: admissionPublicIdSchema, result: z.never().optional() }),
    z.object({ state: z.literal(OPERATION_STATE.completed), operationId: admissionPublicIdSchema, replayed: z.boolean(), result: resultSchema }),
  ]);
}

/** Own parsed DTO types used by route props and browser consumers. */
export type AdmissionRequestDto = z.infer<typeof admissionRequestSchema>;
export type AdmissionReviewDto = z.infer<typeof admissionReviewSchema>;
export type AdmissionOverviewDto = z.infer<typeof admissionOverviewSchema>;
export type AdmissionOutcomeDto = z.infer<typeof admissionOutcomeSchema>;
export type AdmissionBatchResultDto = z.infer<typeof admissionBatchResultSchema>;
export type OperationStateDto<Result> = AdmissionOperationResult<Result>;
