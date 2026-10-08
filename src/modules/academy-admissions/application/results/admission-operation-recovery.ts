/** Owns concrete safe recovery schemas per original manual operation namespace. @module admission-operation-recovery */
import { z } from "zod";
import { ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { createAdmissionOperationStateSchema } from "./admission-flow-result-schemas";
import { admissionCommittedOutcomeSchema, admissionTransitionResultSchema, admissionRetryResultSchema } from "./admission-writer-result-schemas";
import { ADMISSION_POLICY_OPERATION } from "../../constants/admission-policy";
import { admissionPolicyMutationResultSchema } from "./admission-policy-result-schemas";
import { VERIFICATION_ISSUANCE_OPERATION } from "../../constants/verification-issuance";
import { ADMISSION_CONTACT_VERIFICATION_OPERATION } from "../../constants/admission-contact-verification";
import { admissionChallengeSnapshotSchema, admissionChallengeVerificationSnapshotSchema } from "./admission-contact-verification-schemas";
/** Infrastructure projects an own recovery envelope; PostgreSQL rows are not schema-validated. */
export const admissionOperationRecoveryEnvelopeSchema = z.discriminatedUnion("operationType", [
  z.object({ operationType: z.literal(VERIFICATION_ISSUANCE_OPERATION.issue), operation: createAdmissionOperationStateSchema(admissionChallengeSnapshotSchema) }),
  z.object({ operationType: z.literal(VERIFICATION_ISSUANCE_OPERATION.resend), operation: createAdmissionOperationStateSchema(admissionChallengeSnapshotSchema) }),
  z.object({ operationType: z.literal(ADMISSION_CONTACT_VERIFICATION_OPERATION), operation: createAdmissionOperationStateSchema(admissionChallengeVerificationSnapshotSchema) }),
  z.object({ operationType: z.literal(ADMISSION_OPERATION_TYPE.submit), operation: createAdmissionOperationStateSchema(admissionCommittedOutcomeSchema) }),
  z.object({ operationType: z.literal(ADMISSION_OPERATION_TYPE.decide), operation: createAdmissionOperationStateSchema(admissionTransitionResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_OPERATION_TYPE.cancel), operation: createAdmissionOperationStateSchema(admissionTransitionResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_OPERATION_TYPE.allowRetry), operation: createAdmissionOperationStateSchema(admissionRetryResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_POLICY_OPERATION.initialize), operation: createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_POLICY_OPERATION.update), operation: createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_POLICY_OPERATION.activate), operation: createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_POLICY_OPERATION.pause), operation: createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema) }),
]);
/** Public recovery retains only the type/state/id and original confirmed result. */
export const admissionOperationRecoverySchema = z.union([
  z.intersection(z.object({ type: z.literal(VERIFICATION_ISSUANCE_OPERATION.issue) }), createAdmissionOperationStateSchema(admissionChallengeSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(VERIFICATION_ISSUANCE_OPERATION.resend) }), createAdmissionOperationStateSchema(admissionChallengeSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_CONTACT_VERIFICATION_OPERATION) }), createAdmissionOperationStateSchema(admissionChallengeVerificationSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_OPERATION_TYPE.submit) }), createAdmissionOperationStateSchema(admissionCommittedOutcomeSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_OPERATION_TYPE.decide) }), createAdmissionOperationStateSchema(admissionTransitionResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_OPERATION_TYPE.cancel) }), createAdmissionOperationStateSchema(admissionTransitionResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_OPERATION_TYPE.allowRetry) }), createAdmissionOperationStateSchema(admissionRetryResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.initialize) }), createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.update) }), createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.activate) }), createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.pause) }), createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema)),
]);
export type AdmissionOperationRecoveryDto = z.infer<typeof admissionOperationRecoverySchema>;
