/** Defines minimal own ledger snapshots independently of current resource projections. @module admission-writer-result-schemas */
import { z } from "zod";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { admissionRequestSchema } from "./admission-flow-result-schemas";
/** A pending outcome has no member; new admission is basic and an existing legible role is preserved. */
export const admissionCommittedOutcomeSchema = z.object({
  operationId: z.uuid(), outcome: z.enum([ADMISSION_OUTCOME.pending, ADMISSION_OUTCOME.admitted, ADMISSION_OUTCOME.alreadyMember]),
  admissionRequestId: z.uuid().nullable(), committedRequestVersion: z.int().positive().nullable(),
  membership: z.object({ role: z.enum(TRIBE_MEMBER_ROLE), status: z.enum([TRIBE_MEMBERSHIP_STATUS.active, TRIBE_MEMBERSHIP_STATUS.muted]) }).nullable(),
  requestSnapshot: admissionRequestSchema.extend({ status: z.literal(ADMISSION_REQUEST_STATUS.pending) }).optional(),
  created: z.boolean().default(false),
}).refine((result) => result.outcome === ADMISSION_OUTCOME.pending
  ? result.admissionRequestId !== null && result.committedRequestVersion !== null && result.membership === null && (!result.requestSnapshot || result.requestSnapshot.id === result.admissionRequestId && result.requestSnapshot.version === result.committedRequestVersion)
  : result.membership !== null && (result.outcome !== ADMISSION_OUTCOME.admitted || result.membership.role === TRIBE_MEMBER_ROLE.tribemate));
/** Own safe commit snapshot can be replayed without querying today's request into a historical result. */
export type AdmissionSubmissionResult = z.infer<typeof admissionCommittedOutcomeSchema>;
/** A confirmed transition exposes only its original request version/status, without internal notes. */
export const admissionTransitionResultSchema = z.object({ admissionRequestId: z.uuid(), version: z.int().positive(), status: z.enum([ADMISSION_REQUEST_STATUS.approved, ADMISSION_REQUEST_STATUS.rejected, ADMISSION_REQUEST_STATUS.cancelled]) });
/** Only a committed eligibility date/version is exposed; reason and original terminal decision remain private. */
export const admissionRetryResultSchema = z.object({ admissionRequestId: z.uuid(), version: z.int().positive(), retryAllowedAt: z.iso.datetime({ offset: true }) });
