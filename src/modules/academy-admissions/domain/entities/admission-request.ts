/** Models a request independently of membership and proposes immutable local lifecycle transitions. @module admission-request */
import type { AdmissionContact } from "../value-objects/admission-contact";
import type { AdmissionPolicy } from "./admission-policy";
import type { AdmissionActorFacts } from "../policies/admission-eligibility";
import { canPerformAdmissionAction } from "../policies/admission-eligibility";
import { ADMISSION_ACTION, ADMISSION_EVIDENCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS, ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_DECISION_RULE } from "@/src/modules/academy-admissions/constants/admission-decision";
import { AdmissionOperationError } from "../errors/admission-operation-error";

/** Minimal evidence provenance retains its own source without raw provider claims or code material. */
export type AdmissionRequestEvidence =
  | { kind: "none" | "declared" }
  | { kind: "base"; identityEvidenceId: string; verifiedAt: Date }
  | { kind: "local"; proofId: string; verifiedAt: Date };
/** A persisted request has no member role, course grant, subscription or implicit access. */
export type AdmissionRequest = {
  id: string; tribeId: string; userId: string; source: "common" | "personal" | "legacy";
  invitationId: string | null; legacyInvitationId: string | null; requiresAllowlist: boolean;
  contact: AdmissionContact | null; evidence: AdmissionRequestEvidence; bindingId: string | null; proofId: string | null;
  originalPolicy: Pick<AdmissionPolicy, "version" | "verificationEpoch" | "mode" | "contactType" | "requiresAdditionalVerification" | "allowCommonExceptions">;
  applicantMessage: string | null; status: (typeof ADMISSION_REQUEST_STATUS)[keyof typeof ADMISSION_REQUEST_STATUS];
  submittedAt: Date; expiresAt: Date; version: number; decisionId: string | null; cancelReason: string | null;
  resolvedAt: Date | null; retryAllowedAt: Date | null;
};

/**
 * Creates a proposal only; the authoritative writer must resolve current eligibility and commit it.
 * @param input - Own normalized contact/evidence, fixed source, current policy and post-lock clock.
 * @returns A detached pending proposal with one original thirty-day deadline and no membership.
 * @throws AdmissionOperationError when evidence/source invariants cannot represent a request.
 */
export function createPendingAdmissionRequest(input: {
  id: string; tribeId: string; userId: string; source: AdmissionRequest["source"]; contact: AdmissionContact | null;
  evidence: AdmissionRequestEvidence; policy: AdmissionPolicy; message: string | null; now: Date;
  invitationId?: string; legacyInvitationId?: string; requiresAllowlist?: boolean; bindingId?: string;
}): AdmissionRequest {
  const trustedEvidence = input.evidence.kind === ADMISSION_EVIDENCE_KIND.base || input.evidence.kind === ADMISSION_EVIDENCE_KIND.local;
  const sourceValid = input.source === ADMISSION_REQUEST_SOURCE.common ? !input.invitationId && !input.legacyInvitationId
    : input.source === ADMISSION_REQUEST_SOURCE.personal ? Boolean(input.invitationId && !input.legacyInvitationId) : input.source === ADMISSION_REQUEST_SOURCE.legacy && Boolean(input.legacyInvitationId && !input.invitationId);
  if (!Number.isFinite(input.now.getTime()) || input.policy.tribeId !== input.tribeId || !sourceValid
    || input.message !== null && input.message.length > ADMISSION_LIMIT.internalMessageCharacters
    || !input.contact && input.evidence.kind !== ADMISSION_EVIDENCE_KIND.none
    || input.contact && input.evidence.kind === ADMISSION_EVIDENCE_KIND.none
    || input.bindingId && !trustedEvidence) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return {
    id: input.id, tribeId: input.tribeId, userId: input.userId, source: input.source,
    invitationId: input.invitationId ?? null, legacyInvitationId: input.legacyInvitationId ?? null, requiresAllowlist: input.requiresAllowlist ?? false,
    contact: input.contact ? { ...input.contact } : null, evidence: { ...input.evidence }, bindingId: input.bindingId ?? null,
    proofId: input.evidence.kind === ADMISSION_EVIDENCE_KIND.local ? input.evidence.proofId : null,
    originalPolicy: { version: input.policy.version, verificationEpoch: input.policy.verificationEpoch, mode: input.policy.mode, contactType: input.policy.contactType, requiresAdditionalVerification: input.policy.requiresAdditionalVerification, allowCommonExceptions: input.policy.allowCommonExceptions },
    applicantMessage: input.message?.trim() || null, status: ADMISSION_REQUEST_STATUS.pending,
    submittedAt: new Date(input.now), expiresAt: new Date(input.now.getTime() + ADMISSION_LIMIT.pendingValidityMs),
    version: 1, decisionId: null, cancelReason: null, resolvedAt: null, retryAllowedAt: null,
  };
}

/**
 * Computes the original cadence/rejection deadline; an explicit authorized override is stored separately.
 * @param request - Persisted original presentation and resolution, without a fabricated historical time.
 * @returns The next allowed presentation instant without changing any abuse counter or membership.
 */
export function getAdmissionRetryAllowedAt(request: Pick<AdmissionRequest, "status" | "submittedAt" | "resolvedAt" | "retryAllowedAt">): Date {
  if (request.status === ADMISSION_REQUEST_STATUS.rejected && !request.resolvedAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  const cadence = request.submittedAt.getTime() + ADMISSION_LIMIT.submissionCadenceMs;
  const rejection = request.status === ADMISSION_REQUEST_STATUS.rejected && request.resolvedAt
    ? request.resolvedAt.getTime() + ADMISSION_LIMIT.rejectionRetryWaitMs : cadence;
  return new Date(request.retryAllowedAt?.getTime() ?? Math.max(cadence, rejection));
}

/**
 * Proposes owner/leader cancellation independently of the current admission opening.
 * @param input - Current request/version, actual scoped actor, explicit management reason and SQL clock.
 * @returns A terminal proposal or a closed denial; persistence must commit its decision/notice atomically.
 */
export function proposeAdmissionCancellation(input: { request: AdmissionRequest; expectedVersion: number; decisionId: string; actor: AdmissionActorFacts; internalReason: string | null; now: Date }) {
  const { request, actor } = input;
  if (request.status !== ADMISSION_REQUEST_STATUS.pending || request.version !== input.expectedVersion) return { allowed: false as const, code: ADMISSION_ERROR_CODE.requestConflict };
  if (!Number.isFinite(input.now.getTime()) || input.now >= request.expiresAt || input.now < request.submittedAt) return { allowed: false as const, code: ADMISSION_ERROR_CODE.admissionIneligible };
  const own = actor.userId === request.userId;
  if (!canPerformAdmissionAction(actor, own ? ADMISSION_ACTION.cancelOwnRequest : ADMISSION_ACTION.cancelByManagement, { tribeId: request.tribeId, applicantUserId: request.userId })) return { allowed: false as const, code: ADMISSION_ERROR_CODE.permissionDenied };
  const reason = input.internalReason?.trim() || null;
  if (!own && !reason || reason && reason.length > ADMISSION_LIMIT.internalMessageCharacters) return { allowed: false as const, code: ADMISSION_ERROR_CODE.invalidInput };
  return { allowed: true as const, request: { ...request, status: ADMISSION_REQUEST_STATUS.cancelled, version: request.version + 1, decisionId: input.decisionId, cancelReason: reason, resolvedAt: new Date(input.now) }, rule: own ? ADMISSION_DECISION_RULE.applicantCancellation : ADMISSION_DECISION_RULE.managementCancellation, internalReason: reason };
}
