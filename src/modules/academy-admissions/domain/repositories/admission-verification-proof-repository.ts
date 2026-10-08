/** Defines one-use proof attachment independently of persistence and provider delivery. @module admission-verification-proof-repository */
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionVerificationAccountScope } from "./admission-contact-verification";
import type { ADMISSION_PROOF_OPERATION } from "../../constants/admission-proof";
import type { ADMISSION_OPERATION_TYPE } from "../../constants/admission-request";

/** The native owner resolves proof/contact/resource authority; input selects only the original own request and proof references. */
export type AdmissionProofApplicationIntent = AdmissionVerificationAccountScope & { admissionRequestId: string; proofId: string; expectedRequestVersion: number; operationId: string };
/** The atomic application owner returns its own original snapshot, guarded by application before exposing it. */
export interface AdmissionProofApplicationOperations {
  /** @param intent - Native identity and exact original pending request/proof proposal. @returns Registered progress or confirmed attachment/denial without provider work. */
  apply(intent: AdmissionProofApplicationIntent): Promise<unknown>;
}

/** Identity and the original intent must have been claimed by the caller's durable operation ledger. */
export type ApplyAdmissionVerificationProofCommand = {
  scope: VerificationChallengeScope;
  requestId: string;
  proofId: string;
  expectedRequestVersion: number;
  operationId: string;
  ledgerId: string;
  /** Attachment remains the default owner; an initial submission explicitly names its original ledger namespace. */
  operationType?: typeof ADMISSION_PROOF_OPERATION | typeof ADMISSION_OPERATION_TYPE.submit;
};
/** Includes only the incremental pending state; contact, internal audit and private identity stay in their owners. */
export type AdmissionProofApplicationResult =
  | { outcome: "applied"; requestId: string; requestVersion: number; status: "pending"; proofId: string }
  | { outcome: "denied"; code: (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE] };

export interface AdmissionVerificationProofWriter {
  /**
   * Attaches fresh proof/contact/binding/audit without approving or renewing a pending request.
   * @param command - Current scope and original ledger-bound proof/request intent.
   * @returns A stored own transition, confirmed only with the caller's transaction commit.
   */
  applyToPending(command: ApplyAdmissionVerificationProofCommand): Promise<AdmissionProofApplicationResult>;
}
