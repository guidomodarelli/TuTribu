/** Defines admission-owned ports; authoritative writers re-resolve facts and commit related effects together. */
import type { AdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import type { AdmissionOperationResult } from "../entities/admission-operation";
import type { AdmissionNotificationObligation } from "@/src/modules/notifications/domain/entities/admission-notification";

/** Account/tenant/correlation originate at the server boundary, never body permissions. */
export type AdmissionCommandScope = { userId: string; sessionId: string; tribeId: string; requestId: string };
export type AdmissionOperationIdentity = { operationId: string; type: "submit_admission" | "decide_admission_request" | "cancel_admission_request" };
export type AdmissionSubmissionIntent = AdmissionCommandScope & AdmissionOperationIdentity & {
  type: "submit_admission"; expectedPolicyVersion: number; confirmed: true;
  source: { kind: "common" } | { kind: "personal"; token: string } | { kind: "legacy"; token: string };
  contact: AdmissionContact | null; proofId: string | null; message: string | null;
  whatsappNumber?: string | null;
};
export type AdmissionDecisionIntent = AdmissionCommandScope & AdmissionOperationIdentity & {
  type: "decide_admission_request"; admissionRequestId: string; expectedVersion: number; decision: "approve" | "reject";
  internalReason: string; externalMessage: string | null; confirmed: true;
};
export type AdmissionCancellationIntent = AdmissionCommandScope & AdmissionOperationIdentity & {
  type: "cancel_admission_request"; admissionRequestId: string; expectedVersion: number; internalReason: string | null; confirmed: true;
};
export type AdmissionCommittedOutcome = {
  operationId: string; outcome: "pending" | "admitted" | "already_member";
  admissionRequestId: string | null; committedRequestVersion: number | null;
  membership: { role: "leader" | "guardian" | "tribemate"; status: "active" | "muted" } | null;
};

/**
 * Atomic authority port. Concrete implementations must read current clock/scope
 * after locks, resolve replay before CAS, and commit decision, basic membership,
 * redemption/binding, audit and notification obligations in one transaction.
 * No method may use a caller-provided paid/verified/eligible flag as authority.
 */
export interface AdmissionCommandWriter<SubmissionResult extends AdmissionCommittedOutcome = AdmissionCommittedOutcome> {
  submit(intent: AdmissionSubmissionIntent): Promise<AdmissionOperationResult<SubmissionResult>>;
  decide(intent: AdmissionDecisionIntent): Promise<AdmissionOperationResult<AdmissionTransitionResult>>;
  cancel(intent: AdmissionCancellationIntent): Promise<AdmissionOperationResult<AdmissionTransitionResult>>;
}
/** Minimal committed transition snapshot does not claim the historical version is today's state. */
export type AdmissionTransitionResult = { admissionRequestId: string; version: number; status: "approved" | "rejected" | "cancelled" };
/** Reuses the notification owner's complete event vocabulary without duplicating its private contract. */
export type { AdmissionNotificationObligation } from "@/src/modules/notifications/domain/entities/admission-notification";
/** Scoped transaction collaborator persists obligations; no external notification is sent here. */
export interface AdmissionNotificationObligationWriter {
  record(obligation: AdmissionNotificationObligation): Promise<void>;
  recordMany(obligations: readonly AdmissionNotificationObligation[]): Promise<void>;
}
