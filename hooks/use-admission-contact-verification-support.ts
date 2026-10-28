/** Pure decisions of the admission contact verification workflow, kept apart so each hook step stays readable. @module use-admission-contact-verification-support */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AdmissionContactBrowserResult } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import type { AdmissionOperationRecoveryDto } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import type { AdmissionContactIntent, AdmissionContactPending } from "@/lib/academy-admissions/admission-contact-intent";
import type { WriteToast } from "@/lib/toasts/write-toast";
import { ADMISSION_CONTACT_SELECTED_REFERENCE, ADMISSION_CONTACT_ACTION, ADMISSION_CONTACT_ISSUED_REFERENCE, ADMISSION_CONTACT_PHASE, ADMISSION_CONTACT_COPY, ADMISSION_CONTACT_BROWSER_STATUS, ADMISSION_CONTACT_ABSENT_DISCARD_AFTER_MS, ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { ADMISSION_PROOF_OPERATION } from "@/src/modules/academy-admissions/constants/admission-proof";
import { ADMISSION_CONTACT_VERIFICATION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-contact-verification";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";

/** Contact fields the hook reads from the parent's current draft. */
export type ContactProposal = { slug: string; requestId: string | null; policyVersion: number; channel: "email" | "sms" | "whatsapp"; allowedCountries: readonly string[]; phone: string; country: string; invitationToken?: string; legacyInvitationToken?: string; personalScope?: string };
export type ContactPhase = "idle" | "issuing" | "verifying" | "resending" | "applying" | "reading" | "uncertain";
/** Confirmed history can be read by namespace/id; a pending verify still retains its exact challenge separately. */
export type ContactRecoveryReference = AdmissionContactPending | { kind: "verify"; operationId: string } | { kind: "issued"; operationId: string } | { kind: "selected"; operationId: string };
/** A pending original the registry confirmed absent, and the earliest instant its reference may be discarded. */
export type ConfirmedAbsence = { operationId: string; discardableAt: number };
export type ContactFieldErrors = Partial<Record<"phone" | "country" | "verificationCode", string>>;

/** @param result - Own read of the original. @returns True only for the registry's explicit absence (404), never for transport uncertainty. */
export function confirmsAbsence(result: AdmissionContactBrowserResult<unknown>): boolean {
  return result.status === ADMISSION_CONTACT_BROWSER_STATUS.failed && result.code === ADMISSION_ERROR_CODE.resourceUnavailable;
}

/** @param code - Confirmed rejection of a code check. @param message - Its safe copy. @returns The alert to show, or null for an expired code, which the code step presents as a status beside its resend. */
export const challengeAlert = (code: AdmissionErrorCode, message: string) => code === ADMISSION_ERROR_CODE.challengeExpired ? null : message;

/** @param previous - Earlier absence of the same original. @param dispatchedAt - Its dispatch instant, NaN when unknown. @param observedAt - This observation. @returns The instant the absence wait counts from. */
export function absenceSince(previous: ConfirmedAbsence | null, dispatchedAt: number, observedAt: number): number {
  if (previous) return previous.discardableAt - ADMISSION_CONTACT_ABSENT_DISCARD_AFTER_MS;
  return Number.isFinite(dispatchedAt) ? Math.min(dispatchedAt, observedAt) : observedAt;
}

/** @param kind - Original kind. @returns The registry operation type that original must have. */
export function expectedOperationType(kind: ContactRecoveryReference["kind"]): AdmissionOperationRecoveryDto["type"] {
  if (kind === ADMISSION_CONTACT_ACTION.issue) return VERIFICATION_ISSUANCE_OPERATION.issue;
  if (kind === ADMISSION_CONTACT_ACTION.verify) return ADMISSION_CONTACT_VERIFICATION_OPERATION;
  if (kind === ADMISSION_CONTACT_ACTION.apply) return ADMISSION_PROOF_OPERATION;
  return VERIFICATION_ISSUANCE_OPERATION.resend;
}

/** @param original - Registry original. @param intent - Reference it must belong to. @returns Whether its type or state cannot belong to that reference. */
export function isUnexpectedOriginal(original: AdmissionOperationRecoveryDto, intent: ContactRecoveryReference): boolean {
  if (intent.kind === ADMISSION_CONTACT_ISSUED_REFERENCE || intent.kind === ADMISSION_CONTACT_SELECTED_REFERENCE) return original.type !== VERIFICATION_ISSUANCE_OPERATION.issue && original.type !== VERIFICATION_ISSUANCE_OPERATION.resend || original.state !== OPERATION_STATE.completed;
  return original.type !== expectedOperationType(intent.kind);
}

/** @param kind - Explicit write kind. @returns Whether it sends a new code. */
export function isIssuanceKind(kind: ContactRecoveryReference["kind"]): boolean {
  return kind === ADMISSION_CONTACT_ACTION.issue || kind === ADMISSION_CONTACT_ACTION.resend || kind === ADMISSION_CONTACT_ACTION.sms;
}

/** @param actionPhase - Phase of the explicit write. @returns The progress copy of its toast. */
export function writeNoticeCopy(actionPhase: ContactPhase): string {
  if (actionPhase === ADMISSION_CONTACT_PHASE.verifying) return ADMISSION_CONTACT_COPY.checking;
  if (actionPhase === ADMISSION_CONTACT_PHASE.applying) return ADMISSION_CONTACT_COPY.applying;
  return ADMISSION_CONTACT_COPY.sending;
}

/** @param record - Stored references. @returns Whether any reference still needs reading from the registry. */
export function hasRecoverableReferences(record: AdmissionContactIntent | null): record is AdmissionContactIntent {
  return Boolean(record && (record.selectedOperationId || record.issuedOperationId || record.verifiedOperationId || record.pending));
}

/** @param stored - Stored references. @returns Every reference to read, in recovery order. */
export function listRecoveryReferences(stored: AdmissionContactIntent): ContactRecoveryReference[] {
  const references: ContactRecoveryReference[] = [];
  if (stored.selectedOperationId) references.push({ kind: ADMISSION_CONTACT_SELECTED_REFERENCE, operationId: stored.selectedOperationId });
  if (stored.issuedOperationId) references.push({ kind: ADMISSION_CONTACT_ISSUED_REFERENCE, operationId: stored.issuedOperationId });
  if (stored.verifiedOperationId) references.push({ kind: ADMISSION_CONTACT_ACTION.verify, operationId: stored.verifiedOperationId });
  if (stored.pending) references.push(stored.pending);
  return references;
}

/** @param proposal - Current draft. @param previousRequestId - Request whose code may still be current. @returns The current-challenge query for that draft. */
export function currentChallengeQuery(proposal: ContactProposal, previousRequestId: string) {
  return { previousRequestId, expectedPolicyVersion: proposal.policyVersion, channel: proposal.channel, ...(proposal.channel !== MESSAGING_PUBLIC_CHANNEL.email ? { phone: proposal.phone, ...(proposal.country ? { country: proposal.country } : {}) } : {}) };
}

/** @param proposal - Draft the read used. @param current - Current draft. @returns Whether the contact changed meanwhile. */
export function contactProposalChanged(proposal: ContactProposal, current: ContactProposal): boolean {
  return current.phone !== proposal.phone || current.country !== proposal.country || current.channel !== proposal.channel || current.policyVersion !== proposal.policyVersion;
}

/** @param current - Current draft. @returns Whether its personal scope is missing, unexpected or malformed. */
export function hasInvalidPersonalScope(current: ContactProposal): boolean {
  return Boolean(current.invitationToken) !== Boolean(current.personalScope) || Boolean(current.personalScope && !ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN.test(current.personalScope));
}

/** @param current - Current draft. @returns The phone field errors, or null when the contact can receive a code. */
export function readContactFieldErrors(current: ContactProposal): ContactFieldErrors | null {
  if (current.channel === MESSAGING_PUBLIC_CHANNEL.email) return null;
  const normalized = normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.phone, value: current.phone, country: current.country || undefined });
  if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) return { phone: ADMISSION_CONTACT_COPY.phone };
  if (normalized.contact.type !== ADMISSION_CONTACT_TYPE.phone || !current.allowedCountries.includes(normalized.contact.country)) return { country: ADMISSION_CONTACT_COPY.country };
  return null;
}

/** @param current - Current draft. @param operationId - New original. @returns The issue request for that draft. */
export function buildIssueInput(current: ContactProposal, operationId: string) {
  return { operationId, confirmed: true as const, expectedPolicyVersion: current.policyVersion, channel: current.channel, ...(current.channel !== MESSAGING_PUBLIC_CHANNEL.email ? { phone: current.phone, ...(current.country ? { country: current.country } : {}) } : {}), ...(current.requestId ? { requestId: current.requestId } : {}), ...(current.invitationToken ? { invitationToken: current.invitationToken } : {}), ...(!current.requestId && current.legacyInvitationToken ? { legacyInvitationToken: current.legacyInvitationToken } : {}) };
}

/** @param challenge - Current challenge. @param failureCode - Confirmed terminal failure. @param now - Live clock. @returns Seconds until it expires; a server-confirmed expiry wins over a client clock that still counts down. */
export function readExpiresInSeconds(challenge: AdmissionChallengeSnapshot | null, failureCode: AdmissionErrorCode | null, now: string): number | null {
  if (!challenge) return null;
  if (failureCode === ADMISSION_ERROR_CODE.challengeExpired) return 0;
  return Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - new Date(now).getTime()) / MILLISECONDS_PER_SECOND));
}

/** @param discardWhenAbsent - Explicit request to drop an absent original. @param intent - Pending original. @param absence - Its confirmed absence. @returns Whether its wait has passed, so it may be discarded when still absent. */
export function isDiscardableAbsence(discardWhenAbsent: boolean, intent: AdmissionContactPending | undefined | null, absence: ConfirmedAbsence | null): boolean {
  return Boolean(discardWhenAbsent && intent && absence?.operationId === intent.operationId && Date.now() >= absence.discardableAt);
}

/** Refs that scope explicit requests. */
export type ContactRequestRefs = {
  activeRef: RefObject<boolean>;
  generationRef: RefObject<number>;
  busyRef: RefObject<boolean>;
  controllerRef: RefObject<AbortController | null>;
  recordRef: RefObject<AdmissionContactIntent | null>;
  previousUnresolvedRef: RefObject<AdmissionContactIntent | null>;
  writeToastRef: RefObject<WriteToast | null>;
  deliveryControllersRef: RefObject<Set<AbortController>>;
};
type ContactAlertSetters = { setPhase: Dispatch<SetStateAction<ContactPhase>>; setErrorMessage: Dispatch<SetStateAction<string | null>> };

/** @param deliveryControllersRef - Delivery reads in flight. Cancels every one of them. */
export function abortDeliveryReads(deliveryControllersRef: RefObject<Set<AbortController>>): void {
  for (const previousController of deliveryControllersRef.current) previousController.abort();
  deliveryControllersRef.current.clear();
}

/** @param refs - Workflow refs. @param action - The ended write, its toast and its generation. @param setters - Phase and alert setters. Settles its toast and frees the workflow when it still owns it. */
export function settleContactWrite(refs: ContactRequestRefs, action: { controller: AbortController; notice: WriteToast; scopeGeneration: number }, setters: ContactAlertSetters): void {
  if (refs.writeToastRef.current === action.notice) refs.writeToastRef.current = null;
  action.notice.finish();
  if (refs.controllerRef.current !== action.controller) return;
  refs.busyRef.current = false; refs.controllerRef.current = null;
  if (!refs.activeRef.current || refs.generationRef.current !== action.scopeGeneration) return;
  setters.setPhase(refs.recordRef.current?.pending ? ADMISSION_CONTACT_PHASE.uncertain : ADMISSION_CONTACT_PHASE.idle);
  if (action.controller.signal.aborted && refs.recordRef.current?.pending) setters.setErrorMessage(ADMISSION_CONTACT_COPY.uncertain);
}

/** @param currentPhase - Phase when the restore settles. @param recordRef - Stored references. @returns The phase after a restore: uncertain or idle only if nothing replaced the read meanwhile. */
function phaseAfterRestore(currentPhase: ContactPhase, recordRef: RefObject<AdmissionContactIntent | null>): ContactPhase {
  if (currentPhase !== ADMISSION_CONTACT_PHASE.reading) return currentPhase;
  return recordRef.current?.pending ? ADMISSION_CONTACT_PHASE.uncertain : ADMISSION_CONTACT_PHASE.idle;
}

/** @param refs - Workflow refs. @param restore - The ended restore's generation and lifetime. @param setters - Readiness, phase and alert setters. Frees the workflow for the same generation and reports a timeout. */
export function settleContactRestore(refs: ContactRequestRefs, restore: { scopeGeneration: number; signal: AbortSignal }, setters: ContactAlertSetters & { setReady: Dispatch<SetStateAction<boolean>> }): void {
  if (!refs.activeRef.current || refs.generationRef.current !== restore.scopeGeneration) return;
  refs.busyRef.current = false; setters.setReady(true);
  setters.setPhase((currentPhase) => phaseAfterRestore(currentPhase, refs.recordRef));
  if (restore.signal.aborted) { setters.setPhase(ADMISSION_CONTACT_PHASE.uncertain); setters.setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); }
}

/** @param refs - Workflow refs. @param read - The ended read and its generation. @param setters - Phase setter. Frees the workflow when the read still owns it, keeping an unresolved original visible. */
export function settleContactOriginalRead(refs: ContactRequestRefs, read: { controller: AbortController; scopeGeneration: number }, setters: Pick<ContactAlertSetters, "setPhase">): void {
  if (refs.controllerRef.current !== read.controller) return;
  refs.busyRef.current = false; refs.controllerRef.current = null;
  if (refs.activeRef.current && refs.generationRef.current === read.scopeGeneration && (refs.previousUnresolvedRef.current?.pending || refs.recordRef.current?.pending)) setters.setPhase(ADMISSION_CONTACT_PHASE.uncertain);
}

/** @param refs - Workflow refs. @param read - The ended selection read and its generation. @param setters - Phase setter. Frees the workflow when the read still owns it. */
export function settleContactSelection(refs: ContactRequestRefs, read: { controller: AbortController; scopeGeneration: number }, setters: Pick<ContactAlertSetters, "setPhase">): void {
  if (refs.controllerRef.current !== read.controller) return;
  refs.controllerRef.current = null; refs.busyRef.current = false;
  if (refs.activeRef.current && refs.generationRef.current === read.scopeGeneration) setters.setPhase(ADMISSION_CONTACT_PHASE.idle);
}

/** @param refs - Workflow refs. @param hydrationController - The scope's own hydration. Ends the scope: later replies are ignored and whichever request is running now is cancelled. */
export function retireContactScope(refs: Pick<ContactRequestRefs, "activeRef" | "generationRef" | "controllerRef">, hydrationController: AbortController): void {
  refs.activeRef.current = false; refs.generationRef.current += 1; hydrationController.abort(); refs.controllerRef.current?.abort(); refs.controllerRef.current = null;
}
