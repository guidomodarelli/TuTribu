"use client";
/** Owns explicit contact mutations, reference recovery and cancellation while presenters only render controlled props. @module use-admission-contact-verification */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdmissionContactBrowserClient, AdmissionContactBrowserResult, AdmissionContactVerified } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { type AdmissionOperationRecoveryDto, admissionOperationRecoverySchema  } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import type { AdmissionProofApplicationResult } from "@/src/modules/academy-admissions/domain/repositories/admission-verification-proof-repository";
import { ZodError, type z } from "zod";
import type { messageDeliverySchema } from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import { admissionContactApiClient } from "@/lib/academy-admissions/admission-contact-api-client";
import { readAdmissionContactIntent, readEarlierUnresolvedAdmissionContactIntent, writeAdmissionContactIntent, type AdmissionContactIntent, type AdmissionContactPending } from "@/lib/academy-admissions/admission-contact-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { admissionChallengeSnapshotSchema, admissionIssuanceDenialSchema, admissionChallengeVerificationSnapshotSchema } from "@/src/modules/academy-admissions/application/results/admission-contact-verification-schemas";
import { admissionCurrentChallengeSelectionSchema } from "@/src/modules/academy-admissions/application/results/admission-current-challenge-schemas";
import { ADMISSION_CONTACT_SELECTED_REFERENCE, ADMISSION_CONTACT_ACTION, ADMISSION_CONTACT_ISSUED_REFERENCE, ADMISSION_CONTACT_PHASE, ADMISSION_CONTACT_COPY, ADMISSION_CONTACT_BROWSER_STATUS, ADMISSION_CONTACT_BROWSER_TIMEOUT_MS, ADMISSION_CONTACT_CLOCK_INTERVAL_MS, ADMISSION_CONTACT_INTENT_DIAGNOSTIC, ADMISSION_CONTACT_ABSENT_DISCARD_AFTER_MS  } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { admissionProofApplicationSnapshotSchema } from "@/src/modules/academy-admissions/application/results/admission-proof-application-schemas";
import { ADMISSION_PUBLIC_CODE_PATTERN } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_PROOF_OPERATION, ADMISSION_PROOF_APPLICATION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-proof";
import { ADMISSION_CONTACT_VERIFICATION_OPERATION, ADMISSION_CONTACT_TERMINAL_CHALLENGE_FAILURE_CODES } from "@/src/modules/academy-admissions/constants/admission-contact-verification";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { VERIFICATION_TRANSITION_OUTCOME } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { startWriteToast, type WriteToast } from "@/lib/toasts/write-toast";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { requireReadyValue } from "@/hooks/require-ready-value";
import { abortDeliveryReads, absenceSince, buildIssueInput, challengeAlert, confirmsAbsence, contactProposalChanged, currentChallengeQuery, expectedOperationType, hasInvalidPersonalScope, hasRecoverableReferences, isDiscardableAbsence, isIssuanceKind, isPlatformRefusal, isUnexpectedOriginal, listRecoveryReferences, readContactFieldErrors, readExpiresInSeconds, retireContactScope, settleContactOriginalRead, settleContactRestore, settleContactSelection, settleContactWrite, writeNoticeCopy, type ConfirmedAbsence, type ContactFieldErrors, type ContactPhase, type ContactRecoveryReference } from "@/hooks/use-admission-contact-verification-support";

/** The parent owns the one current viewer/draft entrypoint; this hook never fetches another session independently. */
export type AdmissionContactHookOptions = { viewerId: string | null; slug: string; requestId: string | null; requestVersion: number | null; policyVersion: number; channel: "email" | "sms" | "whatsapp"; allowedCountries: readonly string[]; allowSmsAlternative: boolean; phone: string; country: string; enabled: boolean; renderedAt: string; invitationToken?: string; legacyInvitationToken?: string; arrivalScope?: string; personalScope?: string; previousRequestId?: string; authorize: (signal: AbortSignal) => Promise<boolean>; client?: AdmissionContactBrowserClient; onApplied: (result: Extract<AdmissionProofApplicationResult, { outcome: "applied" }>) => void; onProof: (proof: AdmissionContactVerified | null) => void };
type ContactWrite = (intent: AdmissionContactPending, action: (signal: AbortSignal) => Promise<AdmissionContactBrowserResult<unknown>>, type: AdmissionOperationRecoveryDto["type"], actionPhase: ContactPhase) => Promise<void>;
type ContactConsume = (original: AdmissionOperationRecoveryDto, intent: ContactRecoveryReference) => Promise<void>;
type ContactRestore = (stored: AdmissionContactIntent, scopeGeneration: number, signal: AbortSignal) => Promise<void>;
/** One read's draft, generation and lifetime. */
type ContactReadScope = { current: AdmissionContactHookOptions; scopeGeneration: number; signal: AbortSignal };
type ContactStep = "next" | "stop";
const NEXT: ContactStep = "next", STOP: ContactStep = "stop";
const VIEWER = "AdmissionContact viewer";

/** @param options - Native parent scope and controlled draft. @returns Every state, ref and setter of the workflow. */
function useContactState(options: AdmissionContactHookOptions) {
  const client = options.client ?? admissionContactApiClient, latestRef = useRef(options);
  useEffect(() => { latestRef.current = options; }, [options]);
  const [ready, setReady] = useState(false), [confirmed, setConfirmed] = useState(false), [code, setCodeValue] = useState("");
  const [phase, setPhase] = useState<ContactPhase>(ADMISSION_CONTACT_PHASE.idle), [errorMessage, setErrorMessage] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<AdmissionChallengeSnapshot | null>(null), [proof, setProof] = useState<AdmissionContactVerified | null>(null), [delivery, setDelivery] = useState<z.infer<typeof messageDeliverySchema> | null>(null);
  const [pending, setPending] = useState<AdmissionContactPending | null>(null), [now, setNow] = useState(options.renderedAt);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [challengeFailureCode, setChallengeFailureCode] = useState<AdmissionErrorCode | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [requiresReplacement, setRequiresReplacement] = useState(false);
  const activeRef = useRef(false), generationRef = useRef(0), busyRef = useRef(false), controllerRef = useRef<AbortController | null>(null), deliveryControllersRef = useRef(new Set<AbortController>()), recordRef = useRef<AdmissionContactIntent | null>(null), writeToastRef = useRef<WriteToast | null>(null);
  /** A confirmed write is announced by its own toast; a restored result stays on screen as feedback. */
  const confirmWrite = useCallback((message: string) => { if (writeToastRef.current) writeToastRef.current.announce({ kind: "success", message }); else setFeedback(message); }, []);
  const previousUnresolvedRef = useRef<AdmissionContactIntent | null>(null);
  /** Latest read of an unconfirmed original, so a write can reconcile its own lost answer once. */
  const readOriginalCurrentRef = useRef<() => Promise<void>>(async () => {});
  const restoringRef = useRef<{ original: AdmissionContactIntent; patch: Partial<AdmissionContactIntent> } | null>(null);
  const live = useCallback((scopeGeneration: number, signal: AbortSignal) => activeRef.current && generationRef.current === scopeGeneration && !signal.aborted, []);
  const [absence, setAbsenceState] = useState<ConfirmedAbsence | null>(null), absenceRef = useRef<ConfirmedAbsence | null>(null);
  const setAbsence = useCallback((value: ConfirmedAbsence | null) => { absenceRef.current = value; setAbsenceState(value); }, []);
  /** Groups the stable refs the settle steps share; created once, so it never changes a callback's identity. */
  const refs = useMemo(() => ({ activeRef, generationRef, busyRef, controllerRef, recordRef, previousUnresolvedRef, writeToastRef, deliveryControllersRef }), []);
  return { options, client, latestRef, ready, setReady, confirmed, setConfirmed, code, setCodeValue, phase, setPhase, errorMessage, setErrorMessage, feedback, setFeedback, challenge, setChallenge, proof, setProof, delivery, setDelivery, pending, setPending, now, setNow, fieldErrors, setFieldErrors, challengeFailureCode, setChallengeFailureCode, recoveryRequired, setRecoveryRequired, requiresReplacement, setRequiresReplacement, refs, activeRef, generationRef, busyRef, controllerRef, deliveryControllersRef, recordRef, writeToastRef, confirmWrite, previousUnresolvedRef, readOriginalCurrentRef, restoringRef, live, absence, absenceRef, setAbsence };
}
type ContactState = ReturnType<typeof useContactState>;

/** @param workflow - Workflow state. @returns Absence and failure records, durable reference writes and delivery reads. */
function useContactRecords(workflow: ContactState) {
  const { client, latestRef, challenge, absenceRef, setAbsence, setChallengeFailureCode, restoringRef, recordRef, setPending, setErrorMessage, activeRef, generationRef, deliveryControllersRef, live, setDelivery } = workflow;
  /** @param reference - Pending original the registry just reported absent. @returns Nothing; the wait counts from its dispatch, or from the first observed absence when an older reference lacks that instant. */
  const recordAbsence = useCallback((reference: AdmissionContactPending) => {
    const observedAt = Date.now(), dispatchedAt = reference.startedAt ? Date.parse(reference.startedAt) : Number.NaN;
    const previous = absenceRef.current?.operationId === reference.operationId ? absenceRef.current : null;
    setAbsence({ operationId: reference.operationId, discardableAt: absenceSince(previous, dispatchedAt, observedAt) + ADMISSION_CONTACT_ABSENT_DISCARD_AFTER_MS });
  }, [absenceRef, setAbsence]);
  /** @param failureCode - Confirmed own failure, never transport uncertainty. @returns Nothing while retaining only terminal challenge state; editing cannot restore that resource. */
  const recordChallengeFailure = useCallback((failureCode: AdmissionErrorCode) => {
    if (ADMISSION_CONTACT_TERMINAL_CHALLENGE_FAILURE_CODES.includes(failureCode)) setChallengeFailureCode(failureCode);
  }, [setChallengeFailureCode]);
  /** Writes only references before dispatch; unavailable storage blocks any new write. */
  const save = useCallback((patch: Partial<AdmissionContactIntent>): boolean => {
    const current = latestRef.current;
    if (!current.viewerId) return false;
    const value: AdmissionContactIntent = { viewerId: current.viewerId, slug: current.slug, requestId: current.requestId, issuedOperationId: recordRef.current?.issuedOperationId ?? null, verifiedOperationId: recordRef.current?.verifiedOperationId ?? null, pending: recordRef.current?.pending ?? null, ...(recordRef.current?.selectedOperationId ? { selectedOperationId: recordRef.current.selectedOperationId } : {}), ...(current.personalScope ? { personalScope: current.personalScope } : {}), ...(current.arrivalScope ? { arrivalScope: current.arrivalScope } : {}), ...(current.previousRequestId ? { previousRequestId: current.previousRequestId } : {}), ...patch };
    try {
      if (restoringRef.current) { writeAdmissionContactIntent(restoringRef.current.original); restoringRef.current.patch = { ...restoringRef.current.patch, ...patch }; return true; }
      writeAdmissionContactIntent(value); recordRef.current = value; setPending(value.pending); return true;
    }
    catch (error) { console.error(ADMISSION_CONTACT_INTENT_DIAGNOSTIC, { errorName: error instanceof Error ? error.name : "UnknownError", ...(error instanceof ZodError ? { fields: Array.from(new Set(error.issues.map((issue) => issue.path.join(".")))) } : {}) }); setErrorMessage(ADMISSION_CONTACT_COPY.storage); return false; }
  }, [latestRef, recordRef, restoringRef, setErrorMessage, setPending]);
  /** Updates only this scope's transport; reading never sends another code. */
  const readDelivery = useCallback(async (currentChallenge: AdmissionChallengeSnapshot | null = challenge) => {
    const current = latestRef.current;
    if (!currentChallenge?.deliveryId || !activeRef.current) return;
    const scopeGeneration = generationRef.current, readController = new AbortController();
    abortDeliveryReads(deliveryControllersRef);
    deliveryControllersRef.current.add(readController);
    const timeout = window.setTimeout(() => readController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    try {
      if (!await current.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return;
      const result = await client.delivery(current.slug, currentChallenge.deliveryId, readController.signal);
      if (!live(scopeGeneration, readController.signal) || !await latestRef.current.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return;
      if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready && result.value.channel === currentChallenge.channel) setDelivery(result.value);
      else if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.failed) setErrorMessage(result.message);
    } catch {
      if (live(scopeGeneration, readController.signal)) setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]);
    } finally { window.clearTimeout(timeout); deliveryControllersRef.current.delete(readController); }
  }, [activeRef, challenge, client, deliveryControllersRef, generationRef, latestRef, live, setDelivery, setErrorMessage]);
  return { recordAbsence, recordChallengeFailure, save, readDelivery };
}
type ContactRecords = ReturnType<typeof useContactRecords>;

/** @param workflow - Workflow state. @param records - Shared steps. @returns The binding of a registry original before applying its confirmed owned snapshot; no current resource is invented on recovery. */
function useContactConsume(workflow: ContactState, records: ContactRecords) {
  const { latestRef, recordRef, deliveryControllersRef, confirmWrite, setErrorMessage, setPhase, setChallenge, setChallengeFailureCode, setProof, setCodeValue, setDelivery, setRequiresReplacement, setConfirmed, setFeedback } = workflow;
  const { save, readDelivery, recordChallengeFailure } = records;
  const consumeIssuance = useCallback((original: AdmissionOperationRecoveryDto, intent: ContactRecoveryReference) => {
    const denial = admissionIssuanceDenialSchema.safeParse(original.result);
    if (denial.success) { if (!save({ pending: null })) return; setErrorMessage(ADMISSION_ERROR_MESSAGE[denial.data.code]); setPhase(ADMISSION_CONTACT_PHASE.idle); return; }
    const parsed = admissionChallengeSnapshotSchema.safeParse(original.result);
    if (!parsed.success || intent.kind === ADMISSION_CONTACT_ACTION.sms && parsed.data.channel !== MESSAGING_PUBLIC_CHANNEL.sms) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    const selected = intent.kind === ADMISSION_CONTACT_SELECTED_REFERENCE;
    if (!save({ pending: null, issuedOperationId: selected ? null : original.operationId, verifiedOperationId: null, selectedOperationId: selected ? original.operationId : undefined })) return;
    abortDeliveryReads(deliveryControllersRef);
    setChallenge(parsed.data); setChallengeFailureCode(null); setProof(null); setCodeValue(""); setDelivery(null); setRequiresReplacement(selected); if (selected) setConfirmed(false); latestRef.current.onProof(null);
    if (selected) setFeedback(ADMISSION_CONTACT_COPY.selected); else confirmWrite(intent.kind === ADMISSION_CONTACT_ACTION.resend || intent.kind === ADMISSION_CONTACT_ACTION.sms ? ADMISSION_CONTACT_COPY.resent : ADMISSION_CONTACT_COPY.requested);
    setPhase(ADMISSION_CONTACT_PHASE.idle);
    void readDelivery(parsed.data);
  }, [confirmWrite, deliveryControllersRef, latestRef, readDelivery, save, setChallenge, setChallengeFailureCode, setCodeValue, setConfirmed, setDelivery, setErrorMessage, setFeedback, setPhase, setProof, setRequiresReplacement]);
  const consumeVerification = useCallback((original: AdmissionOperationRecoveryDto) => {
    const parsed = admissionChallengeVerificationSnapshotSchema.safeParse(original.result);
    if (!parsed.success) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (parsed.data.result === VERIFICATION_TRANSITION_OUTCOME.denied) { save({ pending: null, verifiedOperationId: null }); recordChallengeFailure(parsed.data.code); setErrorMessage(challengeAlert(parsed.data.code, ADMISSION_ERROR_MESSAGE[parsed.data.code])); setPhase(ADMISSION_CONTACT_PHASE.idle); return; }
    if (!save({ pending: null, verifiedOperationId: original.operationId, issuedOperationId: recordRef.current?.selectedOperationId ?? recordRef.current?.issuedOperationId ?? null, selectedOperationId: undefined })) return;
    setProof(parsed.data); latestRef.current.onProof(parsed.data); setCodeValue(""); confirmWrite(ADMISSION_CONTACT_COPY.verified); setPhase(ADMISSION_CONTACT_PHASE.idle);
  }, [confirmWrite, latestRef, recordChallengeFailure, recordRef, save, setCodeValue, setErrorMessage, setPhase, setProof]);
  const consumeApplication = useCallback((original: AdmissionOperationRecoveryDto, intent: Extract<ContactRecoveryReference, { kind: "apply" }>) => {
    const parsed = admissionProofApplicationSnapshotSchema.safeParse(original.result), current = latestRef.current;
    if (!parsed.success) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (parsed.data.outcome === ADMISSION_PROOF_APPLICATION_OUTCOME.denied) { save({ pending: null }); setErrorMessage(ADMISSION_ERROR_MESSAGE[parsed.data.code]); setPhase(ADMISSION_CONTACT_PHASE.idle); return; }
    if (parsed.data.requestId.toLowerCase() !== current.requestId?.toLowerCase() || parsed.data.proofId.toLowerCase() !== intent.proofId.toLowerCase() || parsed.data.requestVersion !== intent.expectedVersion + 1) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (!save({ pending: null, issuedOperationId: null, verifiedOperationId: null, selectedOperationId: undefined })) return;
    // An attached proof is consumed; historical recovery must not block a fresh check required by a later epoch.
    abortDeliveryReads(deliveryControllersRef);
    setChallenge(null); setProof(null); setDelivery(null); setCodeValue(""); setConfirmed(false);
    current.onApplied(parsed.data); confirmWrite(ADMISSION_CONTACT_COPY.applied); setPhase(ADMISSION_CONTACT_PHASE.idle);
  }, [confirmWrite, deliveryControllersRef, latestRef, save, setChallenge, setCodeValue, setConfirmed, setDelivery, setErrorMessage, setPhase, setProof]);
  /** Binds original namespace/id before applying a confirmed owned snapshot; no current resource is invented on recovery. */
  const consume: ContactConsume = useCallback(async (original, intent) => {
    if (original.operationId.toLowerCase() !== intent.operationId.toLowerCase()) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (isUnexpectedOriginal(original, intent)) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (original.state === OPERATION_STATE.started) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.started); return; }
    if (intent.kind === ADMISSION_CONTACT_ACTION.verify) { consumeVerification(original); return; }
    if (intent.kind === ADMISSION_CONTACT_ACTION.apply) { consumeApplication(original, intent); return; }
    consumeIssuance(original, intent);
  }, [consumeApplication, consumeIssuance, consumeVerification, setErrorMessage, setPhase]);
  return { consume };
}

/** @param workflow - Workflow state. @param records - Shared steps. @param consume - Original consumer. @returns The dispatch of one exact mutation only after validation, native viewer checks and persisted original references. */
function useContactWrite(workflow: ContactState, records: ContactRecords, consume: ContactConsume) {
  const { ready, recoveryRequired, latestRef, refs, busyRef, previousUnresolvedRef, recordRef, deliveryControllersRef, generationRef, controllerRef, writeToastRef, activeRef, readOriginalCurrentRef, live, setErrorMessage, setFeedback, setFieldErrors, setAbsence, setPhase, setDelivery } = workflow;
  const { save, recordChallengeFailure } = records;
  /** @returns Whether the reply left the original unconfirmed, so a lost send may be read once. */
  const applyWriteResult = useCallback(async (result: AdmissionContactBrowserResult<unknown>, intent: AdmissionContactPending, type: AdmissionOperationRecoveryDto["type"]) => {
    if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready) {
      const parsed = admissionOperationRecoverySchema.safeParse(typeof result.value === "object" && result.value !== null ? { type, ...result.value } : null);
      if (!parsed.success) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return true; }
      await consume(parsed.data, intent); return false;
    }
    if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.failed && !result.uncertain) { save({ pending: null }); if (intent.kind === ADMISSION_CONTACT_ACTION.verify) recordChallengeFailure(result.code); setErrorMessage(intent.kind === ADMISSION_CONTACT_ACTION.verify ? challengeAlert(result.code, result.message) : result.message); setPhase(ADMISSION_CONTACT_PHASE.idle); return false; }
    setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); return true;
  }, [consume, recordChallengeFailure, save, setErrorMessage, setPhase]);
  /** @returns Whether the reply left the original unconfirmed, so a lost send may be read once. */
  const performWrite = useCallback(async ({ current, scopeGeneration, signal }: ContactReadScope, intent: AdmissionContactPending, action: (signal: AbortSignal) => Promise<AdmissionContactBrowserResult<unknown>>, type: AdmissionOperationRecoveryDto["type"]) => {
    if (!await current.authorize(signal)) { if (live(scopeGeneration, signal)) { setPhase(ADMISSION_CONTACT_PHASE.idle); setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.authenticationRequired]); } return false; }
    if (!live(scopeGeneration, signal)) return false;
    if (!save({ pending: { ...intent, startedAt: new Date().toISOString() } })) return false;
    const result = await action(signal);
    if (!live(scopeGeneration, signal)) return false;
    if (!await latestRef.current.authorize(signal)) { if (live(scopeGeneration, signal)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.authenticationRequired]); } return false; }
    if (!live(scopeGeneration, signal)) return false;
    return applyWriteResult(result, intent, type);
  }, [applyWriteResult, latestRef, live, save, setErrorMessage, setPhase]);
  /** Dispatches one exact mutation only after validation, native viewer checks and persisted original references. */
  const run: ContactWrite = useCallback(async (intent, action, type, actionPhase) => {
    const current = latestRef.current;
    if (!ready || recoveryRequired || !current.enabled || !current.viewerId || busyRef.current || previousUnresolvedRef.current?.pending || recordRef.current?.pending) return;
    busyRef.current = true; setErrorMessage(null); setFeedback(null); setFieldErrors({}); setAbsence(null); setPhase(actionPhase);
    // A send whose answer was lost may already hold a new code on the server; one read of its original shows it without a reload.
    const issuance = isIssuanceKind(intent.kind);
    if (issuance) { abortDeliveryReads(deliveryControllersRef); setDelivery(null); }
    const scopeGeneration = generationRef.current, actionController = new AbortController(); controllerRef.current = actionController;
    // The browser deadline aborts its own request; unlike an unmount or a scope change, that abort still leaves this scope to reconcile.
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; actionController.abort(); }, ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    let reconcile = false;
    // Failures and unconfirmed originals stay next to the code fields; only a confirmed result becomes the success toast.
    const notice = startWriteToast(writeNoticeCopy(actionPhase)); writeToastRef.current = notice;
    try { if (await performWrite({ current, scopeGeneration, signal: actionController.signal }, intent, action, type)) reconcile = issuance; }
    catch { if (live(scopeGeneration, actionController.signal)) { reconcile = issuance; setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); } }
    finally {
      window.clearTimeout(timeout); settleContactWrite(refs, { controller: actionController, notice, scopeGeneration }, { setPhase, setErrorMessage });
      // Inside finally, so the early returns after a deadline abort still reach it. Read-only and once: an original still absent or in progress keeps the explicit "Consultar operación del código".
      if ((reconcile || issuance && timedOut) && activeRef.current && generationRef.current === scopeGeneration && recordRef.current?.pending?.operationId === intent.operationId) await readOriginalCurrentRef.current();
    }
  }, [activeRef, busyRef, controllerRef, deliveryControllersRef, generationRef, latestRef, live, performWrite, previousUnresolvedRef, readOriginalCurrentRef, ready, recordRef, recoveryRequired, refs, setAbsence, setDelivery, setErrorMessage, setFeedback, setFieldErrors, setPhase, writeToastRef]);
  return { run };
}

/** @param workflow - Workflow state. @param records - Shared steps. @param consume - Original consumer. @returns The resolution of durable references from the actual registry before any recovered result becomes usable UI data. */
function useContactRestore(workflow: ContactState, records: ContactRecords, consume: ContactConsume) {
  const { client, latestRef, refs, restoringRef, busyRef, live, setReady, setRecoveryRequired, setPhase, setErrorMessage, setChallenge, setRequiresReplacement, setProof, setConfirmed, setFeedback } = workflow;
  const { save, recordAbsence } = records;
  const restoreSelected = useCallback(async ({ current, scopeGeneration, signal }: ContactReadScope): Promise<ContactStep> => {
    if (!current.previousRequestId) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    const response = await client.current(current.slug, currentChallengeQuery(current, current.previousRequestId), signal);
    if (!live(scopeGeneration, signal) || !await latestRef.current.authorize(signal) || !live(scopeGeneration, signal)) return STOP;
    // A platform refusal is not an absent code: it says why the selection cannot be read now, and the reference stays to read it again.
    if (response.status !== ADMISSION_CONTACT_BROWSER_STATUS.ready) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(isPlatformRefusal(response) ? response.message : ADMISSION_CONTACT_COPY.absent); return STOP; }
    const selection = admissionCurrentChallengeSelectionSchema.safeParse(response.value);
    if (!selection.success) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (!selection.data.current) { if (!save({ selectedOperationId: undefined })) return STOP; setChallenge(null); setRequiresReplacement(false); return NEXT; }
    if (!save({ selectedOperationId: selection.data.current.operationId })) return STOP;
    setChallenge(selection.data.current.challenge); setRequiresReplacement(selection.data.current.requiresReplacement); setProof(null); setConfirmed(false); setFeedback(selection.data.current.requiresReplacement ? ADMISSION_CONTACT_COPY.selected : ADMISSION_CONTACT_COPY.currentCode);
    return NEXT;
  }, [client, latestRef, live, save, setChallenge, setConfirmed, setErrorMessage, setFeedback, setPhase, setProof, setRequiresReplacement]);
  /** @param reference - Original still in progress. @returns Whether it can be resumed: only a pending write keeps its reference, never confirmed history. */
  const resumeStartedReference = useCallback((reference: Exclude<ContactRecoveryReference, { kind: "selected" }>) => {
    if (reference.kind === ADMISSION_CONTACT_ISSUED_REFERENCE || reference.kind === ADMISSION_CONTACT_ACTION.verify && !("challengeId" in reference)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.started); return false; }
    return save({ pending: reference });
  }, [save, setErrorMessage, setPhase]);
  const restoreOperation = useCallback(async ({ current, scopeGeneration, signal }: ContactReadScope, reference: Exclude<ContactRecoveryReference, { kind: "selected" }>, stored: AdmissionContactIntent): Promise<ContactStep> => {
    const result = await client.operation(current.slug, reference.operationId, signal);
    if (!live(scopeGeneration, signal) || !await latestRef.current.authorize(signal) || !live(scopeGeneration, signal)) return STOP;
    if (result.status !== ADMISSION_CONTACT_BROWSER_STATUS.ready) { if (stored.pending) save({ pending: stored.pending }); if (reference === stored.pending && confirmsAbsence(result)) recordAbsence(stored.pending); setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.absent); return STOP; }
    if (result.value.state === OPERATION_STATE.started && !resumeStartedReference(reference)) return STOP;
    await consume(result.value, reference);
    return !live(scopeGeneration, signal) || result.value.state === OPERATION_STATE.started ? STOP : NEXT;
  }, [client, consume, latestRef, live, recordAbsence, resumeStartedReference, save, setErrorMessage, setPhase]);
  /** @param reference - One stored reference. @param stored - Every stored reference. @param read - Restore draft, generation and lifetime. @returns Whether the next reference can be read. */
  const restoreReference = useCallback(async (reference: ContactRecoveryReference, stored: AdmissionContactIntent, read: ContactReadScope): Promise<ContactStep> => {
    if (reference === stored.pending && !save({ pending: stored.pending })) return STOP;
    if (!await read.current.authorize(read.signal) || !live(read.scopeGeneration, read.signal)) return STOP;
    return reference.kind === ADMISSION_CONTACT_SELECTED_REFERENCE ? restoreSelected(read) : restoreOperation(read, reference, stored);
  }, [live, restoreOperation, restoreSelected, save]);
  /** Resolves durable references from the actual registry before treating any recovered result as usable UI data. */
  const restore: ContactRestore = useCallback(async (stored, scopeGeneration, signal) => {
    const current = latestRef.current;
    const restoration = { original: stored, patch: {} as Partial<AdmissionContactIntent> }; restoringRef.current = restoration;
    busyRef.current = true; setReady(false); setRecoveryRequired(true); setPhase(ADMISSION_CONTACT_PHASE.reading);
    try {
      for (const reference of listRecoveryReferences(stored)) {
        if (await restoreReference(reference, stored, { current, scopeGeneration, signal }) === STOP) return;
      }
      restoringRef.current = null;
      if (!save(restoration.patch)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); return; }
      setRecoveryRequired(false);
    } catch { if (live(scopeGeneration, signal)) { if (stored.pending) save({ pending: stored.pending }); setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); } }
    finally { if (restoringRef.current === restoration) restoringRef.current = null; settleContactRestore(refs, { scopeGeneration, signal }, { setReady, setPhase, setErrorMessage }); }
  }, [busyRef, latestRef, live, refs, restoreReference, restoringRef, save, setErrorMessage, setPhase, setReady, setRecoveryRequired]);
  return { restore };
}

/** @param workflow - Workflow state. @param records - Shared steps. @param recovery - Original consumer and reference restore. @returns Readonly reconciliation of the pending original. */
function useContactOriginalRead(workflow: ContactState, records: ContactRecords, recovery: { consume: ContactConsume; restore: ContactRestore }) {
  const { client, latestRef, refs, recoveryRequired, busyRef, previousUnresolvedRef, recordRef, absenceRef, generationRef, controllerRef, live, setAbsence, setConfirmed, setPending, setPhase, setErrorMessage, setFeedback } = workflow;
  const { save, recordAbsence } = records;
  const { consume, restore } = recovery;
  /** Settlement is historical: it never supplies a challenge or proof to the new presentation. */
  const settlePrevious = useCallback(async (earlier: AdmissionContactIntent, { current, scopeGeneration, signal }: ContactReadScope) => {
    writeAdmissionContactIntent({ ...earlier, pending: null });
    setConfirmed(false);
    previousUnresolvedRef.current = current.previousRequestId ? readEarlierUnresolvedAdmissionContactIntent(requireReadyValue(current.viewerId, VIEWER), current.slug, current.previousRequestId, current.arrivalScope) : null;
    const unresolved = previousUnresolvedRef.current?.pending;
    setPending(unresolved ?? recordRef.current?.pending ?? null); setPhase(unresolved ? ADMISSION_CONTACT_PHASE.uncertain : ADMISSION_CONTACT_PHASE.idle); setErrorMessage(unresolved ? ADMISSION_CONTACT_COPY.uncertain : null);
    if (!previousUnresolvedRef.current && hasRecoverableReferences(recordRef.current)) await restore(recordRef.current, scopeGeneration, signal);
  }, [previousUnresolvedRef, recordRef, restore, setConfirmed, setErrorMessage, setPending, setPhase]);
  const reconcilePrevious = useCallback(async (original: AdmissionOperationRecoveryDto, intent: AdmissionContactPending, previous: AdmissionContactIntent, read: ContactReadScope) => {
    if (original.operationId.toLowerCase() !== intent.operationId.toLowerCase() || original.type !== expectedOperationType(intent.kind)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    if (original.state === OPERATION_STATE.completed) await settlePrevious(previous, read);
    else { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.started); }
  }, [setErrorMessage, setPhase, settlePrevious]);
  /** The original never registered within every deadline, so the server can no longer accept it late; a new code needs a new confirmation and UUID. */
  const discardAbsentOriginal = useCallback(async (previous: AdmissionContactIntent | null, read: ContactReadScope) => {
    setAbsence(null);
    if (previous) await settlePrevious(previous, read);
    else {
      if (!save({ pending: null })) return;
      setConfirmed(false); setPhase(ADMISSION_CONTACT_PHASE.idle);
      if (recoveryRequired && recordRef.current) await restore(recordRef.current, read.scopeGeneration, read.signal);
    }
    if (live(read.scopeGeneration, read.signal)) setFeedback(ADMISSION_CONTACT_COPY.discarded);
  }, [live, recordRef, recoveryRequired, restore, save, setAbsence, setConfirmed, setFeedback, setPhase, settlePrevious]);
  const readPendingOriginal = useCallback(async (intent: AdmissionContactPending, previous: AdmissionContactIntent | null, discardable: boolean, read: ContactReadScope) => {
    const { current, scopeGeneration, signal } = read;
    if (!await current.authorize(signal) || !live(scopeGeneration, signal)) return;
    const result = await client.operation(current.slug, intent.operationId, signal);
    if (!live(scopeGeneration, signal) || !await latestRef.current.authorize(signal) || !live(scopeGeneration, signal)) return;
    if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready) setAbsence(null);
    if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready && previous) await reconcilePrevious(result.value, intent, previous, read);
    else if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready) await consume(result.value, intent);
    else if (confirmsAbsence(result) && discardable) await discardAbsentOriginal(previous, read);
    else if (confirmsAbsence(result)) { recordAbsence(intent); setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.absent); }
    else { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); }
  }, [client, consume, discardAbsentOriginal, latestRef, live, reconcilePrevious, recordAbsence, setAbsence, setErrorMessage, setPhase]);
  /** Readonly reconciliation retains the local intent on absence; no late write is retried with a new UUID.
   * @param discardWhenAbsent - Explicit applicant request to drop a reference whose absence outlived every server deadline; it still reads the original first and keeps it on any other answer. */
  const readOriginal = useCallback(async (discardWhenAbsent = false) => {
    const current = latestRef.current, previous = previousUnresolvedRef.current, intent = previous?.pending ?? recordRef.current?.pending;
    if (!current.enabled || busyRef.current || !intent && (!recoveryRequired || !recordRef.current)) return;
    const discardable = isDiscardableAbsence(discardWhenAbsent, intent, absenceRef.current);
    if (discardWhenAbsent && !discardable) return;
    busyRef.current = true; setErrorMessage(null); setFeedback(null); setPhase(ADMISSION_CONTACT_PHASE.reading);
    const scopeGeneration = generationRef.current, readController = new AbortController(); controllerRef.current = readController;
    const timeout = window.setTimeout(() => readController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    try {
      if (!intent && recordRef.current) { await restore(recordRef.current, scopeGeneration, readController.signal); return; }
      if (!intent) return;
      await readPendingOriginal(intent, previous, discardable, { current, scopeGeneration, signal: readController.signal });
    } catch { if (live(scopeGeneration, readController.signal)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); } }
    finally { window.clearTimeout(timeout); settleContactOriginalRead(refs, { controller: readController, scopeGeneration }, { setPhase }); }
  }, [absenceRef, busyRef, controllerRef, generationRef, latestRef, live, previousUnresolvedRef, readPendingOriginal, recordRef, recoveryRequired, refs, restore, setErrorMessage, setFeedback, setPhase]);
  return { readOriginal };
}

/** @param workflow - Workflow state. @param restore - Reference restore. @param readOriginal - Original read. Keeps the latest restore/read for timers and hydrates browser storage once per scope. */
function useContactLifecycle(workflow: ContactState, restore: ContactRestore, readOriginal: () => Promise<void>) {
  const { options, refs, activeRef, generationRef, busyRef, deliveryControllersRef, recordRef, previousUnresolvedRef, restoringRef, readOriginalCurrentRef, setAbsence, setReady, setRecoveryRequired, setRequiresReplacement, setConfirmed, setCodeValue, setChallenge, setChallengeFailureCode, setProof, setDelivery, setErrorMessage, setFeedback, setPending, setPhase, setNow } = workflow;
  const restoreCurrentRef = useRef(restore);
  useEffect(() => { restoreCurrentRef.current = restore; }, [restore]);
  useEffect(() => { readOriginalCurrentRef.current = readOriginal; }, [readOriginal, readOriginalCurrentRef]);
  useEffect(() => {
    activeRef.current = true; generationRef.current += 1; const scopeGeneration = generationRef.current, hydrationController = new AbortController(), scopeDeliveryControllers = deliveryControllersRef.current; recordRef.current = null; previousUnresolvedRef.current = null; restoringRef.current = null;
    const timeout = window.setTimeout(() => hydrationController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    // Browser storage synchronizes only after mount; generation guards cancel a superseded hydration callback.
    queueMicrotask(() => {
      if (!activeRef.current || generationRef.current !== scopeGeneration) return;
      setReady(false); setRecoveryRequired(false); setRequiresReplacement(false); setConfirmed(false); setCodeValue(""); setChallenge(null); setChallengeFailureCode(null); setProof(null); setDelivery(null); setErrorMessage(null); setFeedback(null); setPending(null); setAbsence(null); setPhase(ADMISSION_CONTACT_PHASE.idle);
      if (options.enabled && options.viewerId) {
        try {
          recordRef.current = readAdmissionContactIntent(options.viewerId, options.slug, options.requestId, { personalScope: options.personalScope, previousRequestId: options.previousRequestId, arrivalScope: options.arrivalScope }); setPending(recordRef.current?.pending ?? null);
          if (options.previousRequestId) {
            const previous = readEarlierUnresolvedAdmissionContactIntent(options.viewerId, options.slug, options.previousRequestId, options.arrivalScope);
            if (previous?.pending) { previousUnresolvedRef.current = previous; setPending(previous.pending); setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); setReady(true); return; }
          }
          if (hasRecoverableReferences(recordRef.current)) { setPhase(ADMISSION_CONTACT_PHASE.reading); void restoreCurrentRef.current(recordRef.current, scopeGeneration, hydrationController.signal).finally(() => window.clearTimeout(timeout)); }
          else setReady(true);
        }
        catch { setErrorMessage(ADMISSION_CONTACT_COPY.storage); }
      }
      setNow(new Date().toISOString());
    });
    const interval = options.enabled ? window.setInterval(() => setNow(new Date().toISOString()), ADMISSION_CONTACT_CLOCK_INTERVAL_MS) : null;
    return () => { retireContactScope(refs, hydrationController); for (const deliveryController of scopeDeliveryControllers) deliveryController.abort(); scopeDeliveryControllers.clear(); busyRef.current = false; window.clearTimeout(timeout); if (interval !== null) window.clearInterval(interval); };
  }, [options.enabled, options.viewerId, options.slug, options.requestId, options.personalScope, options.previousRequestId, options.arrivalScope, setAbsence, activeRef, generationRef, deliveryControllersRef, recordRef, previousUnresolvedRef, restoringRef, setReady, setRecoveryRequired, setRequiresReplacement, setConfirmed, setCodeValue, setChallenge, setChallengeFailureCode, setProof, setDelivery, setErrorMessage, setFeedback, setPending, setPhase, setNow, busyRef, refs]);
}

/** @param workflow - Workflow state. @param records - Shared steps. @returns The check of an exact current candidate without an operation claim; a match still requires a separate explicit resend. */
function useContactSelection(workflow: ContactState, records: ContactRecords) {
  const { client, latestRef, refs, ready, recoveryRequired, busyRef, previousUnresolvedRef, recordRef, generationRef, controllerRef, live, setPhase, setErrorMessage, setFeedback, setChallenge, setRequiresReplacement, setProof, setCodeValue, setDelivery, setConfirmed } = workflow;
  const { save } = records;
  /** @param response - Current-challenge read for an unchanged draft. @returns Whether a new code may be requested: only when no current code exists. */
  const adoptCurrentChallenge = useCallback((response: Awaited<ReturnType<AdmissionContactBrowserClient["current"]>>) => {
    if (response.status !== ADMISSION_CONTACT_BROWSER_STATUS.ready) { setErrorMessage(response.status === ADMISSION_CONTACT_BROWSER_STATUS.failed ? response.message : ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]); return false; }
    const parsed = admissionCurrentChallengeSelectionSchema.safeParse(response.value);
    if (!parsed.success) { setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.publicContractUnusable]); return false; }
    if (!parsed.data.current) return true;
    if (!save({ selectedOperationId: parsed.data.current.operationId, issuedOperationId: null, verifiedOperationId: null, pending: null })) return false;
    setChallenge(parsed.data.current.challenge); setRequiresReplacement(parsed.data.current.requiresReplacement); setProof(null); setCodeValue(""); setDelivery(null); setConfirmed(false); setFeedback(parsed.data.current.requiresReplacement ? ADMISSION_CONTACT_COPY.selected : ADMISSION_CONTACT_COPY.currentCode); latestRef.current.onProof(null);
    return false;
  }, [latestRef, save, setChallenge, setCodeValue, setConfirmed, setDelivery, setErrorMessage, setFeedback, setProof, setRequiresReplacement]);
  /** Checks an exact current candidate without an operation claim; a match still requires a separate explicit resend. */
  const selectCurrent = useCallback(async (): Promise<boolean> => {
    const proposal = latestRef.current, previousRequestId = proposal.previousRequestId;
    if (!previousRequestId) return true;
    if (!ready || recoveryRequired || busyRef.current || previousUnresolvedRef.current?.pending || recordRef.current?.pending) return false;
    busyRef.current = true; setPhase(ADMISSION_CONTACT_PHASE.reading); setErrorMessage(null); setFeedback(null);
    const scopeGeneration = generationRef.current, readController = new AbortController(); controllerRef.current = readController;
    const timeout = window.setTimeout(() => readController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    try {
      if (!await proposal.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return false;
      const response = await client.current(proposal.slug, currentChallengeQuery(proposal, previousRequestId), readController.signal);
      if (!live(scopeGeneration, readController.signal) || !await latestRef.current.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return false;
      if (contactProposalChanged(proposal, latestRef.current)) return false;
      return adoptCurrentChallenge(response);
    } catch { if (live(scopeGeneration, readController.signal)) setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]); return false; }
    finally { window.clearTimeout(timeout); settleContactSelection(refs, { controller: readController, scopeGeneration }, { setPhase }); }
  }, [adoptCurrentChallenge, busyRef, client, controllerRef, generationRef, latestRef, live, previousUnresolvedRef, ready, recordRef, recoveryRequired, refs, setErrorMessage, setFeedback, setPhase]);
  return { selectCurrent };
}

/** @param workflow - Workflow state. @param run - Explicit write. @param selectCurrent - Current candidate check. @returns The explicit code actions and the controlled field setters. */
function useContactActions(workflow: ContactState, run: ContactWrite, selectCurrent: () => Promise<boolean>) {
  const { client, latestRef, challenge, proof, confirmed, code, now, requiresReplacement, challengeFailureCode, setErrorMessage, setFieldErrors, setCodeValue, setFeedback, setConfirmed } = workflow;
  const issue = useCallback(async () => {
    const current = latestRef.current;
    if (hasInvalidPersonalScope(current)) { setErrorMessage(ADMISSION_CONTACT_COPY.storage); return; }
    if (challenge || proof) return;
    if (!confirmed) { setErrorMessage(ADMISSION_CONTACT_COPY.confirm); return; }
    const contactErrors = readContactFieldErrors(current);
    if (contactErrors) { setFieldErrors(contactErrors); return; }
    if (!await selectCurrent()) return;
    const operationId = newAdmissionOperationId(), input = buildIssueInput(current, operationId);
    await run({ kind: ADMISSION_CONTACT_ACTION.issue, operationId }, (signal) => client.issue(current.slug, input, signal), VERIFICATION_ISSUANCE_OPERATION.issue, ADMISSION_CONTACT_PHASE.issuing);
  }, [challenge, client, confirmed, latestRef, proof, run, selectCurrent, setErrorMessage, setFieldErrors]);
  const verify = useCallback(async () => {
    if (requiresReplacement) { setErrorMessage(ADMISSION_CONTACT_COPY.selected); return; }
    if (challengeFailureCode) { setErrorMessage(challengeAlert(challengeFailureCode, ADMISSION_ERROR_MESSAGE[challengeFailureCode])); return; }
    if (!challenge || !ADMISSION_PUBLIC_CODE_PATTERN.test(code)) { setFieldErrors({ verificationCode: ADMISSION_CONTACT_COPY.code }); return; }
    // The code step already shows the expiry as a status with its resend; a check must not add an alert.
    if (new Date(challenge.expiresAt) <= new Date(now)) return;
    if (proof) return;
    const current = latestRef.current, operationId = newAdmissionOperationId();
    await run({ kind: ADMISSION_CONTACT_ACTION.verify, operationId, challengeId: challenge.challengeId }, (signal) => client.verify(current.slug, challenge.challengeId, { operationId, confirmed: true, verificationCode: code }, signal), ADMISSION_CONTACT_VERIFICATION_OPERATION, ADMISSION_CONTACT_PHASE.verifying);
  }, [challenge, challengeFailureCode, client, code, latestRef, now, proof, requiresReplacement, run, setErrorMessage, setFieldErrors]);
  const resend = useCallback(async (useSmsAlternative = false) => {
    if (!challenge || !confirmed) { setErrorMessage(ADMISSION_CONTACT_COPY.confirm); return; }
    if (proof && new Date(proof.applyBefore) > new Date(now)) return;
    if (new Date(challenge.resendAllowedAt) > new Date(now)) { setErrorMessage(ADMISSION_CONTACT_COPY.resendWait); return; }
    const current = latestRef.current;
    if (useSmsAlternative && (!current.allowSmsAlternative || challenge.channel !== MESSAGING_PUBLIC_CHANNEL.whatsapp)) return;
    const operationId = newAdmissionOperationId();
    await run({ kind: useSmsAlternative ? ADMISSION_CONTACT_ACTION.sms : ADMISSION_CONTACT_ACTION.resend, operationId, challengeId: challenge.challengeId }, (signal) => client.resend(current.slug, challenge.challengeId, { operationId, confirmed: true, ...(useSmsAlternative ? { useSmsAlternative: true } : {}) }, signal), VERIFICATION_ISSUANCE_OPERATION.resend, ADMISSION_CONTACT_PHASE.resending);
  }, [challenge, client, confirmed, latestRef, now, proof, run, setErrorMessage]);
  const apply = useCallback(async () => {
    const current = latestRef.current, requestId = current.requestId, requestVersion = current.requestVersion;
    if (!proof || !requestId || !requestVersion || new Date(proof.applyBefore) <= new Date(now)) { setErrorMessage(ADMISSION_CONTACT_COPY.proofExpired); return; }
    const operationId = newAdmissionOperationId();
    await run({ kind: ADMISSION_CONTACT_ACTION.apply, operationId, proofId: proof.proofId, expectedVersion: requestVersion }, (signal) => client.apply(current.slug, requestId, { operationId, confirmed: true, expectedVersion: requestVersion, proofId: proof.proofId }, signal), ADMISSION_PROOF_OPERATION, ADMISSION_CONTACT_PHASE.applying);
  }, [client, latestRef, now, proof, run, setErrorMessage]);
  const setCode = useCallback((value: string) => { setCodeValue(value); setErrorMessage(null); setFeedback(null); setFieldErrors({}); }, [setCodeValue, setErrorMessage, setFeedback, setFieldErrors]);
  const changeConfirmation = useCallback((value: boolean) => { setConfirmed(value); setErrorMessage(null); setFeedback(null); }, [setConfirmed, setErrorMessage, setFeedback]);
  const clearFieldFeedback = useCallback(() => { setFieldErrors({}); setErrorMessage(null); setFeedback(null); }, [setErrorMessage, setFeedback, setFieldErrors]);
  return { issue, verify, resend, apply, setCode, changeConfirmation, clearFieldFeedback };
}

/** @param options - Native parent scope, controlled draft and explicit own transport/authorization callbacks. @returns Current safe UI state and actions; no write runs on mount, timer, field change or recovery. */
export function useAdmissionContactVerification(options: AdmissionContactHookOptions) {
  const workflow = useContactState(options);
  const records = useContactRecords(workflow);
  const { consume } = useContactConsume(workflow, records);
  const { run } = useContactWrite(workflow, records, consume);
  const { restore } = useContactRestore(workflow, records, consume);
  const { readOriginal } = useContactOriginalRead(workflow, records, { consume, restore });
  useContactLifecycle(workflow, restore, readOriginal);
  const { selectCurrent } = useContactSelection(workflow, records);
  const { issue, verify, resend, apply, setCode, changeConfirmation, clearFieldFeedback } = useContactActions(workflow, run, selectCurrent);
  const { ready, recoveryRequired, requiresReplacement, confirmed, code, phase, errorMessage, feedback, fieldErrors, challenge, proof, delivery, pending, now, challengeFailureCode, absence } = workflow;
  const { readDelivery } = records;
  const expiresInSeconds = readExpiresInSeconds(challenge, challengeFailureCode, now);
  const resendInSeconds = challenge ? Math.max(0, Math.ceil((new Date(challenge.resendAllowedAt).getTime() - new Date(now).getTime()) / MILLISECONDS_PER_SECOND)) : null;
  const proofFresh = Boolean(proof && new Date(proof.applyBefore) > new Date(now));
  // Transport feedback remains bound to its current delivery independently of code-field errors.
  const deliveryMessage = delivery?.safeReason ? Object.entries(ADMISSION_ERROR_MESSAGE).find(([errorCode]) => errorCode === delivery.safeReason)?.[1] ?? ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable] : null;
  const challengeMessage = challengeFailureCode && phase !== ADMISSION_CONTACT_PHASE.issuing && phase !== ADMISSION_CONTACT_PHASE.resending ? challengeAlert(challengeFailureCode, ADMISSION_ERROR_MESSAGE[challengeFailureCode]) : null;
  // The wait follows the live clock, so the discard offer appears without another read once every deadline has passed.
  const canDiscardAbsent = Boolean(absence && phase === ADMISSION_CONTACT_PHASE.uncertain && new Date(now).getTime() >= absence.discardableAt);
  const visibleErrorMessage = canDiscardAbsent && errorMessage === ADMISSION_CONTACT_COPY.absent ? ADMISSION_CONTACT_COPY.absentDiscardable : errorMessage;
  return { ready, recoveryRequired, requiresReplacement, confirmed, setConfirmed: changeConfirmation, code, setCode, clearFieldFeedback, phase, errorMessage: visibleErrorMessage, challengeMessage, challengeUnavailable: challengeFailureCode !== null, deliveryMessage, feedback, fieldErrors, challenge, proof, proofFresh, delivery, pending, now, expiresInSeconds, resendInSeconds, issue, verify, resend: () => resend(false), useSmsAlternative: () => resend(true), apply, readOriginal: () => readOriginal(), canDiscardAbsent, discardAbsent: () => readOriginal(true), readDelivery: () => readDelivery() };
}
