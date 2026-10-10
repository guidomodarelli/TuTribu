/** Owns concrete safe recovery schemas per original manual operation namespace. @module admission-operation-recovery */
import { z } from "zod";
import { ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { createAdmissionOperationStateSchema } from "./admission-flow-result-schemas";
import { createAdmissionCommandSnapshotSchema } from "./admission-command-snapshot";
import { admissionCommittedOutcomeSchema, admissionTransitionResultSchema, admissionRetryResultSchema } from "./admission-writer-result-schemas";
import { ADMISSION_POLICY_OPERATION } from "../../constants/admission-policy";
import { admissionPolicyMutationResultSchema } from "./admission-policy-result-schemas";
import { VERIFICATION_ISSUANCE_OPERATION } from "../../constants/verification-issuance";
import { ADMISSION_CONTACT_VERIFICATION_OPERATION } from "../../constants/admission-contact-verification";
import { admissionIssuanceSnapshotSchema, admissionChallengeVerificationSnapshotSchema } from "./admission-contact-verification-schemas";
import { ADMISSION_PROOF_OPERATION } from "../../constants/admission-proof";
import { admissionProofApplicationSnapshotSchema } from "./admission-proof-application-schemas";
import { allowlistMutationSnapshotSchema } from "./allowlist-mutation-schemas";
import { personalInvitationMutationSnapshotSchema } from "../../constants/personal-invitation-management-schemas";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { allowlistImportPreviewSnapshotSchema, allowlistImportConfirmationSnapshotSchema } from "./allowlist-import-operation-schemas";
/** Infrastructure projects an own recovery envelope; PostgreSQL rows are not schema-validated. */
export const admissionOperationRecoveryEnvelopeSchema = z.discriminatedUnion("operationType", [
  z.object({ operationType: z.literal(REAUTHENTICATION_OPERATION.createPersonalInvitation), operation: createAdmissionOperationStateSchema(personalInvitationMutationSnapshotSchema) }),
  z.object({ operationType: z.literal(REAUTHENTICATION_OPERATION.renamePersonalInvitation), operation: createAdmissionOperationStateSchema(personalInvitationMutationSnapshotSchema) }),
  z.object({ operationType: z.literal(REAUTHENTICATION_OPERATION.revokePersonalInvitation), operation: createAdmissionOperationStateSchema(personalInvitationMutationSnapshotSchema) }),

  z.object({ operationType: z.literal(REAUTHENTICATION_OPERATION.previewAllowlistImport), operation: createAdmissionOperationStateSchema(allowlistImportPreviewSnapshotSchema) }),
  z.object({ operationType: z.literal(REAUTHENTICATION_OPERATION.confirmAllowlistImport), operation: createAdmissionOperationStateSchema(allowlistImportConfirmationSnapshotSchema) }),
  z.object({ operationType: z.literal(REAUTHENTICATION_OPERATION.createAllowlistEntry), operation: createAdmissionOperationStateSchema(allowlistMutationSnapshotSchema) }),
  z.object({ operationType: z.literal(REAUTHENTICATION_OPERATION.updateAllowlistEntry), operation: createAdmissionOperationStateSchema(allowlistMutationSnapshotSchema) }),
  z.object({ operationType: z.literal(ADMISSION_PROOF_OPERATION), operation: createAdmissionOperationStateSchema(admissionProofApplicationSnapshotSchema) }),
  z.object({ operationType: z.literal(VERIFICATION_ISSUANCE_OPERATION.issue), operation: createAdmissionOperationStateSchema(admissionIssuanceSnapshotSchema) }),
  z.object({ operationType: z.literal(VERIFICATION_ISSUANCE_OPERATION.resend), operation: createAdmissionOperationStateSchema(admissionIssuanceSnapshotSchema) }),
  z.object({ operationType: z.literal(ADMISSION_CONTACT_VERIFICATION_OPERATION), operation: createAdmissionOperationStateSchema(admissionChallengeVerificationSnapshotSchema) }),
  z.object({ operationType: z.literal(ADMISSION_OPERATION_TYPE.submit), operation: createAdmissionOperationStateSchema(createAdmissionCommandSnapshotSchema(admissionCommittedOutcomeSchema)) }),
  z.object({ operationType: z.literal(ADMISSION_OPERATION_TYPE.decide), operation: createAdmissionOperationStateSchema(createAdmissionCommandSnapshotSchema(admissionTransitionResultSchema)) }),
  z.object({ operationType: z.literal(ADMISSION_OPERATION_TYPE.cancel), operation: createAdmissionOperationStateSchema(createAdmissionCommandSnapshotSchema(admissionTransitionResultSchema)) }),
  z.object({ operationType: z.literal(ADMISSION_OPERATION_TYPE.allowRetry), operation: createAdmissionOperationStateSchema(createAdmissionCommandSnapshotSchema(admissionRetryResultSchema)) }),
  z.object({ operationType: z.literal(ADMISSION_POLICY_OPERATION.initialize), operation: createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_POLICY_OPERATION.update), operation: createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_POLICY_OPERATION.activate), operation: createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema) }),
  z.object({ operationType: z.literal(ADMISSION_POLICY_OPERATION.pause), operation: createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema) }),
]);
/** Public recovery retains only the type/state/id and original confirmed result. */
export const admissionOperationRecoverySchema = z.union([
  z.intersection(z.object({ type: z.literal(REAUTHENTICATION_OPERATION.createPersonalInvitation) }), createAdmissionOperationStateSchema(personalInvitationMutationSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(REAUTHENTICATION_OPERATION.renamePersonalInvitation) }), createAdmissionOperationStateSchema(personalInvitationMutationSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(REAUTHENTICATION_OPERATION.revokePersonalInvitation) }), createAdmissionOperationStateSchema(personalInvitationMutationSnapshotSchema)),

  z.intersection(z.object({ type: z.literal(REAUTHENTICATION_OPERATION.previewAllowlistImport) }), createAdmissionOperationStateSchema(allowlistImportPreviewSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(REAUTHENTICATION_OPERATION.confirmAllowlistImport) }), createAdmissionOperationStateSchema(allowlistImportConfirmationSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(REAUTHENTICATION_OPERATION.createAllowlistEntry) }), createAdmissionOperationStateSchema(allowlistMutationSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(REAUTHENTICATION_OPERATION.updateAllowlistEntry) }), createAdmissionOperationStateSchema(allowlistMutationSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_PROOF_OPERATION) }), createAdmissionOperationStateSchema(admissionProofApplicationSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(VERIFICATION_ISSUANCE_OPERATION.issue) }), createAdmissionOperationStateSchema(admissionIssuanceSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(VERIFICATION_ISSUANCE_OPERATION.resend) }), createAdmissionOperationStateSchema(admissionIssuanceSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_CONTACT_VERIFICATION_OPERATION) }), createAdmissionOperationStateSchema(admissionChallengeVerificationSnapshotSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_OPERATION_TYPE.submit) }), createAdmissionOperationStateSchema(createAdmissionCommandSnapshotSchema(admissionCommittedOutcomeSchema))),
  z.intersection(z.object({ type: z.literal(ADMISSION_OPERATION_TYPE.decide) }), createAdmissionOperationStateSchema(createAdmissionCommandSnapshotSchema(admissionTransitionResultSchema))),
  z.intersection(z.object({ type: z.literal(ADMISSION_OPERATION_TYPE.cancel) }), createAdmissionOperationStateSchema(createAdmissionCommandSnapshotSchema(admissionTransitionResultSchema))),
  z.intersection(z.object({ type: z.literal(ADMISSION_OPERATION_TYPE.allowRetry) }), createAdmissionOperationStateSchema(createAdmissionCommandSnapshotSchema(admissionRetryResultSchema))),
  z.intersection(z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.initialize) }), createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.update) }), createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.activate) }), createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema)),
  z.intersection(z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.pause) }), createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema)),
]);
export type AdmissionOperationRecoveryDto = z.infer<typeof admissionOperationRecoverySchema>;
