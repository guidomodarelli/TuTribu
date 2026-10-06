/** Defines admission-owned ports; authoritative writers re-resolve facts and commit related effects together. */
import type { AdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { AdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import type { AdmissionActorFacts, AdmissionSubmissionFacts, PendingAdmissionReviewFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Account/tenant/correlation originate at the server boundary, never body permissions. */
export type AdmissionCommandScope = { userId: string; sessionId: string; tribeId: string; requestId: string };
export type AdmissionOperationIdentity = { operationId: string; type: "submit_admission" | "decide_admission_request" | "cancel_admission_request" };
export type AdmissionSubmissionIntent = AdmissionCommandScope & AdmissionOperationIdentity & {
  type: "submit_admission"; expectedPolicyVersion: number; confirmed: true;
  source: { kind: "common" } | { kind: "personal"; token: string } | { kind: "legacy"; token: string };
  contact: AdmissionContact | null; proofId: string | null; message: string | null;
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
export type AdmissionWriterFailure = { code: (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE] };

/** Queries return facts only, with no acceptance, canje, delivery or automatic approval. */
export interface AdmissionFactsReader {
  getSubmissionFacts(scope: AdmissionCommandScope, intent: AdmissionSubmissionIntent): Promise<AdmissionSubmissionFacts>;
  getReviewFacts(scope: AdmissionCommandScope, admissionRequestId: string): Promise<PendingAdmissionReviewFacts | null>;
  getCurrentActor(scope: AdmissionCommandScope): Promise<AdmissionActorFacts | null>;
}
/** Own policy projection: countries are supplied only by MessagingUsagePolicyReader. */
export interface AdmissionPolicyRepository {
  getPolicy(scope: AdmissionCommandScope): Promise<AdmissionPolicy | null>;
}
/**
 * Atomic authority port. Concrete implementations must read current clock/scope
 * after locks, resolve replay before CAS, and commit decision, basic membership,
 * redemption/binding, audit and notification obligations in one transaction.
 * No method may use a caller-provided paid/verified/eligible flag as authority.
 */
export interface AdmissionCommandWriter {
  submit(intent: AdmissionSubmissionIntent): Promise<{ committed: true; result: AdmissionCommittedOutcome } | { committed: false; failure: AdmissionWriterFailure }>;
  decide(intent: AdmissionDecisionIntent): Promise<{ committed: true; admissionRequestId: string; version: number; status: "approved" | "rejected" } | { committed: false; failure: AdmissionWriterFailure }>;
  cancel(intent: AdmissionCancellationIntent): Promise<{ committed: true; admissionRequestId: string; version: number; status: "cancelled" } | { committed: false; failure: AdmissionWriterFailure }>;
}
/** Membership owner facts; admission never writes courses, subscriptions or privileged roles. */
export interface AdmissionMembershipReader {
  getMembership(userId: string, tribeId: string): Promise<AdmissionSubmissionFacts["membership"]>;
}
/** The product owner decides whether another legitimate source resolved a pending admission. */
export interface AdmissionExternalResolutionReader {
  hasLegitimateBasicMembership(userId: string, tribeId: string): Promise<boolean>;
}
/** Scoped transaction collaborator persists obligations; no external notification is sent here. */
export interface AdmissionNotificationObligationWriter {
  record(obligation: { id: string; tribeId: string; admissionRequestId: string; applicantUserId: string; event: "pending_created" | "approved" | "rejected" | "cancelled" | "expired" }): Promise<void>;
}
