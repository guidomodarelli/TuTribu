"use client";
/** Owns explicit contact mutations, reference recovery and cancellation while presenters only render controlled props. @module use-admission-contact-verification */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdmissionContactBrowserClient, AdmissionContactBrowserResult, AdmissionContactVerified } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import type { AdmissionOperationRecoveryDto } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import type { AdmissionProofApplicationResult } from "@/src/modules/academy-admissions/domain/repositories/admission-verification-proof-repository";
import { ZodError, type z } from "zod";
import type { messageDeliverySchema } from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import { admissionContactApiClient } from "@/lib/academy-admissions/admission-contact-api-client";
import { readAdmissionContactIntent, readEarlierUnresolvedAdmissionContactIntent, writeAdmissionContactIntent, type AdmissionContactIntent, type AdmissionContactPending } from "@/lib/academy-admissions/admission-contact-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { admissionChallengeSnapshotSchema, admissionIssuanceDenialSchema, admissionChallengeVerificationSnapshotSchema } from "@/src/modules/academy-admissions/application/results/admission-contact-verification-schemas";
import { admissionCurrentChallengeSelectionSchema } from "@/src/modules/academy-admissions/application/results/admission-current-challenge-schemas";
import { ADMISSION_CONTACT_SELECTED_REFERENCE } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { admissionProofApplicationSnapshotSchema } from "@/src/modules/academy-admissions/application/results/admission-proof-application-schemas";
import { ADMISSION_CONTACT_ACTION, ADMISSION_CONTACT_ISSUED_REFERENCE, ADMISSION_CONTACT_PHASE, ADMISSION_CONTACT_COPY, ADMISSION_CONTACT_BROWSER_STATUS, ADMISSION_CONTACT_BROWSER_TIMEOUT_MS, ADMISSION_CONTACT_CLOCK_INTERVAL_MS, ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN, ADMISSION_CONTACT_INTENT_DIAGNOSTIC } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { ADMISSION_PUBLIC_CODE_PATTERN } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { ADMISSION_PROOF_OPERATION, ADMISSION_PROOF_APPLICATION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-proof";
import { ADMISSION_CONTACT_VERIFICATION_OPERATION, ADMISSION_CONTACT_TERMINAL_CHALLENGE_FAILURE_CODES } from "@/src/modules/academy-admissions/constants/admission-contact-verification";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { VERIFICATION_TRANSITION_OUTCOME } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";

/** The parent owns the one current viewer/draft entrypoint; this hook never fetches another session independently. */
export type AdmissionContactHookOptions = { viewerId: string | null; slug: string; requestId: string | null; requestVersion: number | null; policyVersion: number; channel: "email" | "sms" | "whatsapp"; allowedCountries: readonly string[]; allowSmsAlternative: boolean; phone: string; country: string; enabled: boolean; renderedAt: string; invitationToken?: string; personalScope?: string; previousRequestId?: string; authorize: (signal: AbortSignal) => Promise<boolean>; client?: AdmissionContactBrowserClient; onApplied: (result: Extract<AdmissionProofApplicationResult, { outcome: "applied" }>) => void; onProof: (proof: AdmissionContactVerified | null) => void };
type ContactPhase = "idle" | "issuing" | "verifying" | "resending" | "applying" | "reading" | "uncertain";
/** Confirmed history can be read by namespace/id; a pending verify still retains its exact challenge separately. */
type ContactRecoveryReference = AdmissionContactPending | { kind: "verify"; operationId: string } | { kind: "issued"; operationId: string } | { kind: "selected"; operationId: string };

/** @param options - Native parent scope, controlled draft and explicit own transport/authorization callbacks. @returns Current safe UI state and actions; no write runs on mount, timer, field change or recovery. */
export function useAdmissionContactVerification(options: AdmissionContactHookOptions) {
  const client = options.client ?? admissionContactApiClient, latest = useRef(options);
  useEffect(() => { latest.current = options; }, [options]);
  const [ready, setReady] = useState(false), [confirmed, setConfirmed] = useState(false), [code, setCodeValue] = useState("");
  const [phase, setPhase] = useState<ContactPhase>(ADMISSION_CONTACT_PHASE.idle), [errorMessage, setErrorMessage] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<AdmissionChallengeSnapshot | null>(null), [proof, setProof] = useState<AdmissionContactVerified | null>(null), [delivery, setDelivery] = useState<z.infer<typeof messageDeliverySchema> | null>(null);
  const [pending, setPending] = useState<AdmissionContactPending | null>(null), [now, setNow] = useState(options.renderedAt);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"phone" | "country" | "verificationCode", string>>>({});
  const [challengeFailureCode, setChallengeFailureCode] = useState<AdmissionErrorCode | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [requiresReplacement, setRequiresReplacement] = useState(false);
  const active = useRef(false), generation = useRef(0), busy = useRef(false), controller = useRef<AbortController | null>(null), deliveryControllers = useRef(new Set<AbortController>()), record = useRef<AdmissionContactIntent | null>(null);
  const previousUnresolved = useRef<AdmissionContactIntent | null>(null);
  const restoring = useRef<{ original: AdmissionContactIntent; patch: Partial<AdmissionContactIntent> } | null>(null);
  const live = (scopeGeneration: number, signal: AbortSignal) => active.current && generation.current === scopeGeneration && !signal.aborted;

  /** @param failureCode - Confirmed own failure, never transport uncertainty. @returns Nothing while retaining only terminal challenge state; editing cannot restore that resource. */
  const recordChallengeFailure = useCallback((failureCode: AdmissionErrorCode) => {
    if (ADMISSION_CONTACT_TERMINAL_CHALLENGE_FAILURE_CODES.includes(failureCode)) setChallengeFailureCode(failureCode);
  }, []);

  /** Writes only references before dispatch; unavailable storage blocks any new write. */
  const save = useCallback((patch: Partial<AdmissionContactIntent>): boolean => {
    const current = latest.current;
    if (!current.viewerId) return false;
    const value: AdmissionContactIntent = { viewerId: current.viewerId, slug: current.slug, requestId: current.requestId, issuedOperationId: record.current?.issuedOperationId ?? null, verifiedOperationId: record.current?.verifiedOperationId ?? null, pending: record.current?.pending ?? null, ...(record.current?.selectedOperationId ? { selectedOperationId: record.current.selectedOperationId } : {}), ...(current.personalScope ? { personalScope: current.personalScope } : {}), ...(current.previousRequestId ? { previousRequestId: current.previousRequestId } : {}), ...patch };
    try {
      if (restoring.current) { writeAdmissionContactIntent(restoring.current.original); restoring.current.patch = { ...restoring.current.patch, ...patch }; return true; }
      writeAdmissionContactIntent(value); record.current = value; setPending(value.pending); return true;
    }
    catch (error) { console.error(ADMISSION_CONTACT_INTENT_DIAGNOSTIC, { errorName: error instanceof Error ? error.name : "UnknownError", ...(error instanceof ZodError ? { fields: Array.from(new Set(error.issues.map((issue) => issue.path.join(".")))) } : {}) }); setErrorMessage(ADMISSION_CONTACT_COPY.storage); return false; }
  }, []);

  /** Updates only this scope's transport; reading never sends another code. */
  const readDelivery = useCallback(async (currentChallenge: AdmissionChallengeSnapshot | null = challenge) => {
    const current = latest.current;
    if (!currentChallenge?.deliveryId || !active.current) return;
    const scopeGeneration = generation.current, readController = new AbortController();
    for (const previousController of deliveryControllers.current) previousController.abort();
    deliveryControllers.current.clear();
    deliveryControllers.current.add(readController);
    const timeout = window.setTimeout(() => readController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    try {
      if (!await current.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return;
      const result = await client.delivery(current.slug, currentChallenge.deliveryId, readController.signal);
      if (!live(scopeGeneration, readController.signal) || !await latest.current.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return;
      if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready && result.value.channel === currentChallenge.channel) setDelivery(result.value);
      else if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.failed) setErrorMessage(result.message);
    } catch {
      if (live(scopeGeneration, readController.signal)) setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]);
    } finally { window.clearTimeout(timeout); deliveryControllers.current.delete(readController); }
  }, [challenge, client]);

  /** Binds original namespace/id before applying a confirmed owned snapshot; no current resource is invented on recovery. */
  const consume = useCallback(async (original: AdmissionOperationRecoveryDto, intent: ContactRecoveryReference) => {
    if (original.operationId.toLowerCase() !== intent.operationId.toLowerCase()) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    const expectedType = intent.kind === ADMISSION_CONTACT_ACTION.issue ? VERIFICATION_ISSUANCE_OPERATION.issue : intent.kind === ADMISSION_CONTACT_ACTION.verify ? ADMISSION_CONTACT_VERIFICATION_OPERATION : intent.kind === ADMISSION_CONTACT_ACTION.apply ? ADMISSION_PROOF_OPERATION : VERIFICATION_ISSUANCE_OPERATION.resend;
    if (intent.kind === ADMISSION_CONTACT_ISSUED_REFERENCE || intent.kind === ADMISSION_CONTACT_SELECTED_REFERENCE ? original.type !== VERIFICATION_ISSUANCE_OPERATION.issue && original.type !== VERIFICATION_ISSUANCE_OPERATION.resend || original.state !== OPERATION_STATE.completed : original.type !== expectedType) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (original.state === OPERATION_STATE.started) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.started); return; }
    if (intent.kind === ADMISSION_CONTACT_ISSUED_REFERENCE || intent.kind === ADMISSION_CONTACT_SELECTED_REFERENCE || intent.kind === ADMISSION_CONTACT_ACTION.issue || intent.kind === ADMISSION_CONTACT_ACTION.resend || intent.kind === ADMISSION_CONTACT_ACTION.sms) {
      const denial = admissionIssuanceDenialSchema.safeParse(original.result);
      if (denial.success) { if (!save({ pending: null })) return; setErrorMessage(ADMISSION_ERROR_MESSAGE[denial.data.code]); setPhase(ADMISSION_CONTACT_PHASE.idle); return; }
      const parsed = admissionChallengeSnapshotSchema.safeParse(original.result);
      if (!parsed.success || intent.kind === ADMISSION_CONTACT_ACTION.sms && parsed.data.channel !== MESSAGING_PUBLIC_CHANNEL.sms) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
      const selected = intent.kind === ADMISSION_CONTACT_SELECTED_REFERENCE;
      if (!save({ pending: null, issuedOperationId: selected ? null : original.operationId, verifiedOperationId: null, selectedOperationId: selected ? original.operationId : undefined })) return;
      for (const previousController of deliveryControllers.current) previousController.abort();
      deliveryControllers.current.clear();
      setChallenge(parsed.data); setChallengeFailureCode(null); setProof(null); setCodeValue(""); setDelivery(null); setRequiresReplacement(selected); if (selected) setConfirmed(false); latest.current.onProof(null); setFeedback(selected ? ADMISSION_CONTACT_COPY.selected : ADMISSION_CONTACT_COPY.requested); setPhase(ADMISSION_CONTACT_PHASE.idle);
      void readDelivery(parsed.data); return;
    }
    if (intent.kind === ADMISSION_CONTACT_ACTION.verify) {
      const parsed = admissionChallengeVerificationSnapshotSchema.safeParse(original.result);
      if (!parsed.success) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
      if (parsed.data.result === VERIFICATION_TRANSITION_OUTCOME.denied) { save({ pending: null, verifiedOperationId: null }); recordChallengeFailure(parsed.data.code); setErrorMessage(ADMISSION_ERROR_MESSAGE[parsed.data.code]); setPhase(ADMISSION_CONTACT_PHASE.idle); return; }
      if (!save({ pending: null, verifiedOperationId: original.operationId, issuedOperationId: record.current?.selectedOperationId ?? record.current?.issuedOperationId ?? null, selectedOperationId: undefined })) return;
      setProof(parsed.data); latest.current.onProof(parsed.data); setCodeValue(""); setFeedback(ADMISSION_CONTACT_COPY.verified); setPhase(ADMISSION_CONTACT_PHASE.idle); return;
    }
    const parsed = admissionProofApplicationSnapshotSchema.safeParse(original.result), current = latest.current;
    if (!parsed.success) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (parsed.data.outcome === ADMISSION_PROOF_APPLICATION_OUTCOME.denied) { save({ pending: null }); setErrorMessage(ADMISSION_ERROR_MESSAGE[parsed.data.code]); setPhase(ADMISSION_CONTACT_PHASE.idle); return; }
    if (parsed.data.requestId.toLowerCase() !== current.requestId?.toLowerCase() || parsed.data.proofId.toLowerCase() !== intent.proofId.toLowerCase() || parsed.data.requestVersion !== intent.expectedVersion + 1) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
    if (!save({ pending: null })) return;
    current.onApplied(parsed.data); setFeedback(ADMISSION_CONTACT_COPY.applied); setPhase(ADMISSION_CONTACT_PHASE.idle);
  }, [readDelivery, recordChallengeFailure, save]);

  /** Dispatches one exact mutation only after validation, native viewer checks and persisted original references. */
  const run = useCallback(async (intent: AdmissionContactPending, action: (signal: AbortSignal) => Promise<AdmissionContactBrowserResult<unknown>>, type: AdmissionOperationRecoveryDto["type"], actionPhase: ContactPhase) => {
    const current = latest.current;
    if (!ready || recoveryRequired || !current.enabled || !current.viewerId || busy.current || previousUnresolved.current?.pending || record.current?.pending) return;
    busy.current = true; setErrorMessage(null); setFeedback(null); setFieldErrors({}); setPhase(actionPhase);
    if (intent.kind === ADMISSION_CONTACT_ACTION.issue || intent.kind === ADMISSION_CONTACT_ACTION.resend || intent.kind === ADMISSION_CONTACT_ACTION.sms) {
      for (const previousController of deliveryControllers.current) previousController.abort();
      deliveryControllers.current.clear();
      setDelivery(null);
    }
    const scopeGeneration = generation.current, actionController = new AbortController(); controller.current = actionController;
    const timeout = window.setTimeout(() => actionController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    try {
      if (!await current.authorize(actionController.signal)) { if (live(scopeGeneration, actionController.signal)) { setPhase(ADMISSION_CONTACT_PHASE.idle); setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.authenticationRequired]); } return; }
      if (!live(scopeGeneration, actionController.signal)) return;
      if (!save({ pending: intent })) return;
      const result = await action(actionController.signal);
      if (!live(scopeGeneration, actionController.signal)) return;
      if (!await latest.current.authorize(actionController.signal)) { if (live(scopeGeneration, actionController.signal)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.authenticationRequired]); } return; }
      if (!live(scopeGeneration, actionController.signal)) return;
      if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready) {
        const parsed = admissionOperationRecoverySchema.safeParse(typeof result.value === "object" && result.value !== null ? { type, ...result.value } : null);
        if (!parsed.success) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
        await consume(parsed.data, intent);
      } else if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.failed && !result.uncertain) { save({ pending: null }); if (intent.kind === ADMISSION_CONTACT_ACTION.verify) recordChallengeFailure(result.code); setErrorMessage(result.message); setPhase(ADMISSION_CONTACT_PHASE.idle); }
      else { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); }
    } catch { if (live(scopeGeneration, actionController.signal)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); } }
    finally { window.clearTimeout(timeout); if (controller.current === actionController) { busy.current = false; controller.current = null; if (active.current && generation.current === scopeGeneration) { setPhase(record.current?.pending ? ADMISSION_CONTACT_PHASE.uncertain : ADMISSION_CONTACT_PHASE.idle); if (actionController.signal.aborted && record.current?.pending) setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); } } }
  }, [consume, ready, recoveryRequired, recordChallengeFailure, save]);

  /** Resolves durable references from the actual registry before treating any recovered result as usable UI data. */
  const restore = useCallback(async (stored: AdmissionContactIntent, scopeGeneration: number, signal: AbortSignal) => {
    const current = latest.current;
    const restoration = { original: stored, patch: {} as Partial<AdmissionContactIntent> }; restoring.current = restoration;
    busy.current = true; setReady(false); setRecoveryRequired(true); setPhase(ADMISSION_CONTACT_PHASE.reading);
    try {
      const references: ContactRecoveryReference[] = [];
      if (stored.selectedOperationId) references.push({ kind: ADMISSION_CONTACT_SELECTED_REFERENCE, operationId: stored.selectedOperationId });
      if (stored.issuedOperationId) references.push({ kind: ADMISSION_CONTACT_ISSUED_REFERENCE, operationId: stored.issuedOperationId });
      if (stored.verifiedOperationId) references.push({ kind: ADMISSION_CONTACT_ACTION.verify, operationId: stored.verifiedOperationId });
      if (stored.pending) references.push(stored.pending);
      for (const reference of references) {
        if (reference === stored.pending && !save({ pending: stored.pending })) return;
        if (!await current.authorize(signal) || !live(scopeGeneration, signal)) return;
        if (reference.kind === ADMISSION_CONTACT_SELECTED_REFERENCE) {
          if (!current.previousRequestId) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
          const response = await client.current(current.slug, { previousRequestId: current.previousRequestId, expectedPolicyVersion: current.policyVersion, channel: current.channel, ...(current.channel !== MESSAGING_PUBLIC_CHANNEL.email ? { phone: current.phone, ...(current.country ? { country: current.country } : {}) } : {}) }, signal);
          if (!live(scopeGeneration, signal) || !await latest.current.authorize(signal) || !live(scopeGeneration, signal)) return;
          if (response.status !== ADMISSION_CONTACT_BROWSER_STATUS.ready) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.absent); return; }
          const selection = admissionCurrentChallengeSelectionSchema.safeParse(response.value);
          if (!selection.success) throw new Error(ADMISSION_ERROR_CODE.publicContractUnusable);
          if (!selection.data.current) { if (!save({ selectedOperationId: undefined })) return; setChallenge(null); setRequiresReplacement(false); continue; }
          if (!save({ selectedOperationId: selection.data.current.operationId })) return;
          setChallenge(selection.data.current.challenge); setRequiresReplacement(selection.data.current.requiresReplacement); setProof(null); setConfirmed(false); setFeedback(selection.data.current.requiresReplacement ? ADMISSION_CONTACT_COPY.selected : ADMISSION_CONTACT_COPY.currentCode);
          continue;
        }
        const result = await client.operation(current.slug, reference.operationId, signal);
        if (!live(scopeGeneration, signal) || !await latest.current.authorize(signal) || !live(scopeGeneration, signal)) return;
        if (result.status !== ADMISSION_CONTACT_BROWSER_STATUS.ready) { if (stored.pending) save({ pending: stored.pending }); setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.absent); return; }
        if (result.value.state === OPERATION_STATE.started) {
          if (reference.kind === ADMISSION_CONTACT_ISSUED_REFERENCE || reference.kind === ADMISSION_CONTACT_ACTION.verify && !("challengeId" in reference)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.started); return; }
          if (!save({ pending: reference })) return;
        }
        await consume(result.value, reference);
        if (!live(scopeGeneration, signal) || result.value.state === OPERATION_STATE.started) return;
      }
      restoring.current = null;
      if (!save(restoration.patch)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); return; }
      setRecoveryRequired(false);
    } catch { if (live(scopeGeneration, signal)) { if (stored.pending) save({ pending: stored.pending }); setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); } }
    finally { if (restoring.current === restoration) restoring.current = null; if (active.current && generation.current === scopeGeneration) { busy.current = false; setReady(true); setPhase((currentPhase) => currentPhase === ADMISSION_CONTACT_PHASE.reading ? record.current?.pending ? ADMISSION_CONTACT_PHASE.uncertain : ADMISSION_CONTACT_PHASE.idle : currentPhase); if (signal.aborted) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); } } }
  }, [client, consume, save]);
  /** Readonly reconciliation retains the local intent on absence; no late write is retried with a new UUID. */
  const readOriginal = useCallback(async () => {
    const current = latest.current, previous = previousUnresolved.current, intent = previous?.pending ?? record.current?.pending;
    if (!current.enabled || busy.current || !intent && (!recoveryRequired || !record.current)) return;
    busy.current = true; setErrorMessage(null); setFeedback(null); setPhase(ADMISSION_CONTACT_PHASE.reading);
    const scopeGeneration = generation.current, readController = new AbortController(); controller.current = readController;
    const timeout = window.setTimeout(() => readController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    try {
      if (!intent && record.current) { await restore(record.current, scopeGeneration, readController.signal); return; }
      if (!intent) return;
      if (!await current.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return;
      const result = await client.operation(current.slug, intent.operationId, readController.signal);
      if (!live(scopeGeneration, readController.signal) || !await latest.current.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return;
      if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready && previous) {
        const expectedType = intent.kind === ADMISSION_CONTACT_ACTION.issue ? VERIFICATION_ISSUANCE_OPERATION.issue : intent.kind === ADMISSION_CONTACT_ACTION.verify ? ADMISSION_CONTACT_VERIFICATION_OPERATION : intent.kind === ADMISSION_CONTACT_ACTION.apply ? ADMISSION_PROOF_OPERATION : VERIFICATION_ISSUANCE_OPERATION.resend;
        if (result.value.operationId.toLowerCase() !== intent.operationId.toLowerCase() || result.value.type !== expectedType) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
        if (result.value.state === OPERATION_STATE.completed) {
          // Settlement is historical: it never supplies a challenge or proof to the new presentation.
          writeAdmissionContactIntent({ ...previous, pending: null });
          setConfirmed(false);
          previousUnresolved.current = current.previousRequestId ? readEarlierUnresolvedAdmissionContactIntent(current.viewerId!, current.slug, current.previousRequestId) : null;
          setPending(previousUnresolved.current?.pending ?? record.current?.pending ?? null); setPhase(previousUnresolved.current?.pending ? ADMISSION_CONTACT_PHASE.uncertain : ADMISSION_CONTACT_PHASE.idle); setErrorMessage(previousUnresolved.current?.pending ? ADMISSION_CONTACT_COPY.uncertain : null);
          if (!previousUnresolved.current && record.current && (record.current.selectedOperationId || record.current.issuedOperationId || record.current.verifiedOperationId || record.current.pending)) await restore(record.current, scopeGeneration, readController.signal);
        } else { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.started); }
      } else if (result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready) await consume(result.value, intent);
      else { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(result.status === ADMISSION_CONTACT_BROWSER_STATUS.failed && result.code === ADMISSION_ERROR_CODE.resourceUnavailable ? ADMISSION_CONTACT_COPY.absent : ADMISSION_CONTACT_COPY.uncertain); }
    } catch { if (live(scopeGeneration, readController.signal)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); } }
    finally { window.clearTimeout(timeout); if (controller.current === readController) { busy.current = false; controller.current = null; if (active.current && generation.current === scopeGeneration && (previousUnresolved.current?.pending || record.current?.pending)) { setPhase(ADMISSION_CONTACT_PHASE.uncertain); } } }
  }, [client, consume, recoveryRequired, restore]);

  const restoreCurrent = useRef(restore);
  useEffect(() => { restoreCurrent.current = restore; }, [restore]);

  useEffect(() => {
    active.current = true; generation.current += 1; const scopeGeneration = generation.current, hydrationController = new AbortController(), scopeDeliveryControllers = deliveryControllers.current; record.current = null; previousUnresolved.current = null; restoring.current = null;
    const timeout = window.setTimeout(() => hydrationController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    // Browser storage synchronizes only after mount; generation guards cancel a superseded hydration callback.
    queueMicrotask(() => {
      if (!active.current || generation.current !== scopeGeneration) return;
      setReady(false); setRecoveryRequired(false); setRequiresReplacement(false); setConfirmed(false); setCodeValue(""); setChallenge(null); setChallengeFailureCode(null); setProof(null); setDelivery(null); setErrorMessage(null); setFeedback(null); setPending(null); setPhase(ADMISSION_CONTACT_PHASE.idle);
      if (options.enabled && options.viewerId) {
        try {
          record.current = readAdmissionContactIntent(options.viewerId, options.slug, options.requestId, options.personalScope, options.previousRequestId); setPending(record.current?.pending ?? null);
          if (options.previousRequestId) {
            const previous = readEarlierUnresolvedAdmissionContactIntent(options.viewerId, options.slug, options.previousRequestId);
            if (previous?.pending) { previousUnresolved.current = previous; setPending(previous.pending); setPhase(ADMISSION_CONTACT_PHASE.uncertain); setErrorMessage(ADMISSION_CONTACT_COPY.uncertain); setReady(true); return; }
          }
          if (record.current && (record.current.selectedOperationId || record.current.issuedOperationId || record.current.verifiedOperationId || record.current.pending)) { setPhase(ADMISSION_CONTACT_PHASE.reading); void restoreCurrent.current(record.current, scopeGeneration, hydrationController.signal).finally(() => window.clearTimeout(timeout)); }
          else setReady(true);
        }
        catch { setErrorMessage(ADMISSION_CONTACT_COPY.storage); }
      }
      setNow(new Date().toISOString());
    });
    const interval = options.enabled ? window.setInterval(() => setNow(new Date().toISOString()), ADMISSION_CONTACT_CLOCK_INTERVAL_MS) : null;
    return () => { active.current = false; generation.current += 1; hydrationController.abort(); controller.current?.abort(); controller.current = null; for (const deliveryController of scopeDeliveryControllers) deliveryController.abort(); scopeDeliveryControllers.clear(); busy.current = false; window.clearTimeout(timeout); if (interval !== null) window.clearInterval(interval); };
  }, [options.enabled, options.viewerId, options.slug, options.requestId, options.personalScope, options.previousRequestId]);

  /** Checks an exact current candidate without an operation claim; a match still requires a separate explicit resend. */
  const selectCurrent = useCallback(async (): Promise<boolean> => {
    const proposal = latest.current;
    if (!proposal.previousRequestId) return true;
    if (!ready || recoveryRequired || busy.current || previousUnresolved.current?.pending || record.current?.pending) return false;
    busy.current = true; setPhase(ADMISSION_CONTACT_PHASE.reading); setErrorMessage(null); setFeedback(null);
    const scopeGeneration = generation.current, readController = new AbortController(); controller.current = readController;
    const timeout = window.setTimeout(() => readController.abort(), ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
    try {
      if (!await proposal.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return false;
      const response = await client.current(proposal.slug, { previousRequestId: proposal.previousRequestId, expectedPolicyVersion: proposal.policyVersion, channel: proposal.channel, ...(proposal.channel !== MESSAGING_PUBLIC_CHANNEL.email ? { phone: proposal.phone, ...(proposal.country ? { country: proposal.country } : {}) } : {}) }, readController.signal);
      if (!live(scopeGeneration, readController.signal) || !await latest.current.authorize(readController.signal) || !live(scopeGeneration, readController.signal)) return false;
      const current = latest.current;
      if (current.phone !== proposal.phone || current.country !== proposal.country || current.channel !== proposal.channel || current.policyVersion !== proposal.policyVersion) return false;
      if (response.status !== ADMISSION_CONTACT_BROWSER_STATUS.ready) { setErrorMessage(response.status === ADMISSION_CONTACT_BROWSER_STATUS.failed ? response.message : ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]); return false; }
      const parsed = admissionCurrentChallengeSelectionSchema.safeParse(response.value);
      if (!parsed.success) { setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.publicContractUnusable]); return false; }
      if (!parsed.data.current) return true;
      if (!save({ selectedOperationId: parsed.data.current.operationId, issuedOperationId: null, verifiedOperationId: null, pending: null })) return false;
      setChallenge(parsed.data.current.challenge); setRequiresReplacement(parsed.data.current.requiresReplacement); setProof(null); setCodeValue(""); setDelivery(null); setConfirmed(false); setFeedback(parsed.data.current.requiresReplacement ? ADMISSION_CONTACT_COPY.selected : ADMISSION_CONTACT_COPY.currentCode); latest.current.onProof(null);
      return false;
    } catch { if (live(scopeGeneration, readController.signal)) setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]); return false; }
    finally { window.clearTimeout(timeout); if (controller.current === readController) { controller.current = null; busy.current = false; if (active.current && generation.current === scopeGeneration) setPhase(ADMISSION_CONTACT_PHASE.idle); } }
  }, [client, ready, recoveryRequired, save]);

  const issue = useCallback(async () => {
    const current = latest.current;
    if (Boolean(current.invitationToken) !== Boolean(current.personalScope) || current.personalScope && !ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN.test(current.personalScope)) { setErrorMessage(ADMISSION_CONTACT_COPY.storage); return; }
    if (challenge || proof) return;
    if (!confirmed) { setErrorMessage(ADMISSION_CONTACT_COPY.confirm); return; }
    if (current.channel !== MESSAGING_PUBLIC_CHANNEL.email) {
      const normalized = normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.phone, value: current.phone, country: current.country || undefined });
      if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) { setFieldErrors({ phone: ADMISSION_CONTACT_COPY.phone }); return; }
      if (normalized.contact.type !== ADMISSION_CONTACT_TYPE.phone || !current.allowedCountries.includes(normalized.contact.country)) { setFieldErrors({ country: ADMISSION_CONTACT_COPY.country }); return; }
    }
    if (!await selectCurrent()) return;
    const operationId = newAdmissionOperationId(), input = { operationId, confirmed: true as const, expectedPolicyVersion: current.policyVersion, channel: current.channel, ...(current.channel !== MESSAGING_PUBLIC_CHANNEL.email ? { phone: current.phone, ...(current.country ? { country: current.country } : {}) } : {}), ...(current.requestId ? { requestId: current.requestId } : {}), ...(current.invitationToken ? { invitationToken: current.invitationToken } : {}) };
    await run({ kind: ADMISSION_CONTACT_ACTION.issue, operationId }, (signal) => client.issue(current.slug, input, signal), VERIFICATION_ISSUANCE_OPERATION.issue, ADMISSION_CONTACT_PHASE.issuing);
  }, [challenge, client, confirmed, proof, run, selectCurrent]);
  const verify = useCallback(async () => {
    if (requiresReplacement) { setErrorMessage(ADMISSION_CONTACT_COPY.selected); return; }
    if (challengeFailureCode) { setErrorMessage(ADMISSION_ERROR_MESSAGE[challengeFailureCode]); return; }
    if (!challenge || !ADMISSION_PUBLIC_CODE_PATTERN.test(code)) { setFieldErrors({ verificationCode: ADMISSION_CONTACT_COPY.code }); return; }
    if (new Date(challenge.expiresAt) <= new Date(now)) { setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.challengeExpired]); return; }
    if (proof) return;
    const current = latest.current, operationId = newAdmissionOperationId();
    await run({ kind: ADMISSION_CONTACT_ACTION.verify, operationId, challengeId: challenge.challengeId }, (signal) => client.verify(current.slug, challenge.challengeId, { operationId, confirmed: true, verificationCode: code }, signal), ADMISSION_CONTACT_VERIFICATION_OPERATION, ADMISSION_CONTACT_PHASE.verifying);
  }, [challenge, challengeFailureCode, client, code, now, proof, requiresReplacement, run]);
  const resend = useCallback(async (useSmsAlternative = false) => {
    if (!challenge || !confirmed) { setErrorMessage(ADMISSION_CONTACT_COPY.confirm); return; }
    if (proof && new Date(proof.applyBefore) > new Date(now)) return;
    if (new Date(challenge.resendAllowedAt) > new Date(now)) { setErrorMessage(ADMISSION_CONTACT_COPY.resendWait); return; }
    const current = latest.current;
    if (useSmsAlternative && (!current.allowSmsAlternative || challenge.channel !== MESSAGING_PUBLIC_CHANNEL.whatsapp)) return;
    const operationId = newAdmissionOperationId();
    await run({ kind: useSmsAlternative ? ADMISSION_CONTACT_ACTION.sms : ADMISSION_CONTACT_ACTION.resend, operationId, challengeId: challenge.challengeId }, (signal) => client.resend(current.slug, challenge.challengeId, { operationId, confirmed: true, ...(useSmsAlternative ? { useSmsAlternative: true } : {}) }, signal), VERIFICATION_ISSUANCE_OPERATION.resend, ADMISSION_CONTACT_PHASE.resending);
  }, [challenge, client, confirmed, now, proof, run]);
  const apply = useCallback(async () => {
    const current = latest.current;
    if (!proof || !current.requestId || !current.requestVersion || new Date(proof.applyBefore) <= new Date(now)) { setErrorMessage(ADMISSION_CONTACT_COPY.proofExpired); return; }
    const operationId = newAdmissionOperationId();
    await run({ kind: ADMISSION_CONTACT_ACTION.apply, operationId, proofId: proof.proofId, expectedVersion: current.requestVersion }, (signal) => client.apply(current.slug, current.requestId!, { operationId, confirmed: true, expectedVersion: current.requestVersion!, proofId: proof.proofId }, signal), ADMISSION_PROOF_OPERATION, ADMISSION_CONTACT_PHASE.applying);
  }, [client, now, proof, run]);
  const setCode = useCallback((value: string) => { setCodeValue(value); setErrorMessage(null); setFeedback(null); setFieldErrors({}); }, []);
  const changeConfirmation = useCallback((value: boolean) => { setConfirmed(value); setErrorMessage(null); setFeedback(null); }, []);
  const clearFieldFeedback = useCallback(() => { setFieldErrors({}); setErrorMessage(null); setFeedback(null); }, []);
  const expiresInSeconds = challenge ? Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - new Date(now).getTime()) / MILLISECONDS_PER_SECOND)) : null;
  const resendInSeconds = challenge ? Math.max(0, Math.ceil((new Date(challenge.resendAllowedAt).getTime() - new Date(now).getTime()) / MILLISECONDS_PER_SECOND)) : null;
  const proofFresh = Boolean(proof && new Date(proof.applyBefore) > new Date(now));
  // Transport feedback remains bound to its current delivery independently of code-field errors.
  const deliveryMessage = delivery?.safeReason ? Object.entries(ADMISSION_ERROR_MESSAGE).find(([code]) => code === delivery.safeReason)?.[1] ?? ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable] : null;
  const challengeMessage = challengeFailureCode && phase !== ADMISSION_CONTACT_PHASE.issuing && phase !== ADMISSION_CONTACT_PHASE.resending ? ADMISSION_ERROR_MESSAGE[challengeFailureCode] : null;
  return { ready, recoveryRequired, requiresReplacement, confirmed, setConfirmed: changeConfirmation, code, setCode, clearFieldFeedback, phase, errorMessage, challengeMessage, challengeUnavailable: challengeFailureCode !== null, deliveryMessage, feedback, fieldErrors, challenge, proof, proofFresh, delivery, pending, now, expiresInSeconds, resendInSeconds, issue, verify, resend: () => resend(false), useSmsAlternative: () => resend(true), apply, readOriginal, readDelivery: () => readDelivery() };
}
