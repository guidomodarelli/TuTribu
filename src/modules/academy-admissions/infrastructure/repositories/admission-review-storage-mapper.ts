/** Maps only consumed reviewer storage fields; PostgreSQL records are never schema-revalidated. @module admission-review-storage-mapper */
import { parsePhoneNumber } from "libphonenumber-js/max";
import type { AdmissionRequest, AdmissionRequestEvidence } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import type { AdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { AdmissionReviewRecord } from "@/src/modules/academy-admissions/domain/repositories/admission-review-reader";
import type { AdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import type { AdmissionLocalProofFacts, AdmissionSourceFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_EVIDENCE_KIND, ADMISSION_SOURCE_KIND, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";

/** Raw selected fields remain private to the SQL adapter and mapper. */
export type AdmissionReviewStorageRecord = {
  request: Omit<AdmissionRequest, "contact" | "evidence" | "submittedAt" | "expiresAt" | "resolvedAt" | "retryAllowedAt"> & {
    contactType: "email" | "phone" | null; contactValue: string | null; evidenceKind: "none" | "declared" | "base" | "local";
    identityEvidenceId: string | null; evidenceVerifiedAt: string | null; submittedAt: string; expiresAt: string; resolvedAt: string | null; retryAllowedAt: string | null;
  };
  applicantName: string; applicantEmail: string;
  googleAccount: NonNullable<AdmissionReviewRecord["review"]["account"]>["googleAccount"];
  baseEvidence: AdmissionReviewRecord["review"]["baseEvidence"];
  connection: AdmissionReviewRecord["review"]["currentConnection"];
  allowlistEntry: { tribeId: string; contactType: "email" | "phone"; contactValue: string; enabled: boolean; boundUserId: string | null } | null;
  contactBinding: { ownerUserId: string; contactType: "email" | "phone"; contactValue: string } | null;
  reviewer: NonNullable<AdmissionReviewRecord["review"]["reviewer"]>;
  tribe: Omit<AdmissionReviewRecord["review"]["tribe"], "recoveryLocked">;
  policy: (Omit<AdmissionPolicy, "activatedAt"> & { activatedAt: string | null }) | null;
  membership: AdmissionReviewRecord["review"]["membership"];
  invitation: (Omit<Extract<AdmissionSourceFacts, { kind: "personal" }>["invitation"], "contact" | "expiresAt"> & { contactType: "email" | "phone"; contactValue: string; expiresAt: string | null }) | null;
  proof: (Omit<AdmissionLocalProofFacts, "contact" | "purpose" | "verifiedAt" | "applyBefore"> & { contactType: "email" | "phone"; contactValue: string; verifiedAt: string; applyBefore: string }) | null;
  internalReason: string | null; externalMessage: string | null;
};

/** @param type - Stored canonical contact type. @param value - Canonical stored destination. @returns A domain contact or null for no-contact manual admission. */
function contactFromStorage(type: "email" | "phone" | null, value: string | null): AdmissionContact | null {
  if (!type || !value) return null;
  return type === ADMISSION_CONTACT_TYPE.email ? { type, value } : { type, value, country: parsePhoneNumber(value).country ?? "" };
}

/** @param row - Original provenance fields. @returns Its recorded source without inventing verification time. */
function evidenceFromStorage(row: AdmissionReviewStorageRecord["request"]): AdmissionRequestEvidence {
  if (row.evidenceKind === ADMISSION_EVIDENCE_KIND.none || row.evidenceKind === ADMISSION_EVIDENCE_KIND.declared) return { kind: row.evidenceKind };
  if (row.evidenceKind === ADMISSION_EVIDENCE_KIND.base && row.identityEvidenceId && row.evidenceVerifiedAt) return { kind: row.evidenceKind, identityEvidenceId: row.identityEvidenceId, verifiedAt: new Date(row.evidenceVerifiedAt) };
  if (row.evidenceKind === ADMISSION_EVIDENCE_KIND.local && row.proofId && row.evidenceVerifiedAt) return { kind: row.evidenceKind, proofId: row.proofId, verifiedAt: new Date(row.evidenceVerifiedAt) };
  throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
}

/** @param row - Authorized private SQL projection. @param now - SQL clock after actor/role locks. @param recoveryLocked - Current platform recovery state. @returns Private domain facts for the implemented manual writer, with historical evidence kept distinct. */
export function mapAdmissionReviewStorage(row: AdmissionReviewStorageRecord, now: Date, recoveryLocked: boolean): AdmissionReviewRecord {
  const stored = row.request;
  const contact = contactFromStorage(stored.contactType, stored.contactValue);
  const request: AdmissionRequest = { id: stored.id, tribeId: stored.tribeId, userId: stored.userId, source: stored.source, invitationId: stored.invitationId, legacyInvitationId: stored.legacyInvitationId,
    requiresAllowlist: stored.requiresAllowlist, bindingId: stored.bindingId, proofId: stored.proofId, originalPolicy: stored.originalPolicy, applicantMessage: stored.applicantMessage,
    status: stored.status, version: stored.version, decisionId: stored.decisionId, cancelReason: stored.cancelReason,
    contact, evidence: evidenceFromStorage(stored), submittedAt: new Date(stored.submittedAt), expiresAt: new Date(stored.expiresAt), resolvedAt: stored.resolvedAt ? new Date(stored.resolvedAt) : null, retryAllowedAt: stored.retryAllowedAt ? new Date(stored.retryAllowedAt) : null };
  const policy = row.policy ? { ...row.policy, activatedAt: row.policy.activatedAt ? new Date(row.policy.activatedAt) : null } : null;
  const proofContact = row.proof ? contactFromStorage(row.proof.contactType, row.proof.contactValue) : null;
  const proof = row.proof && proofContact ? { ...row.proof, contact: proofContact, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, verifiedAt: new Date(row.proof.verifiedAt), applyBefore: new Date(row.proof.applyBefore) } : null;
  const invitationContact = row.invitation ? contactFromStorage(row.invitation.contactType, row.invitation.contactValue) : null;
  const source: AdmissionSourceFacts = row.invitation && invitationContact ? { kind: ADMISSION_SOURCE_KIND.personal, invitation: { ...row.invitation, contact: invitationContact, expiresAt: row.invitation.expiresAt ? new Date(row.invitation.expiresAt) : null } } : { kind: ADMISSION_SOURCE_KIND.common };
  const entryContact = row.allowlistEntry ? contactFromStorage(row.allowlistEntry.contactType, row.allowlistEntry.contactValue) : null;
  const bindingContact = row.contactBinding ? contactFromStorage(row.contactBinding.contactType, row.contactBinding.contactValue) : null;
  const approvalSupported = stored.source === ADMISSION_REQUEST_SOURCE.common && (policy?.mode === ADMISSION_POLICY_MODE.manualReview || policy?.mode === ADMISSION_POLICY_MODE.allowlist);
  return { request, applicantName: row.applicantName, internalReason: row.internalReason, externalMessage: row.externalMessage, approvalSupported,
    review: { now, tribe: { ...row.tribe, recoveryLocked }, account: { userId: stored.userId, normalizedEmail: row.applicantEmail.trim().toLowerCase(), googleAccount: row.googleAccount }, policy, source, contact,
      membership: row.membership, localProof: proof, baseEvidence: row.baseEvidence, currentConnection: row.connection,
      contactBinding: row.contactBinding && bindingContact ? { ownerUserId: row.contactBinding.ownerUserId, contact: bindingContact } : null,
      allowlistEntry: row.allowlistEntry && entryContact ? { tribeId: row.allowlistEntry.tribeId, contact: entryContact, enabled: row.allowlistEntry.enabled, boundUserId: row.allowlistEntry.boundUserId } : null,
      reviewer: row.reviewer, request: { id: stored.id, userId: stored.userId, expiresAt: request.expiresAt, source, attachedEvidence: proof } } };
}
