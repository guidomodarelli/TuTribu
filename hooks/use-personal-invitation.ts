"use client";
/** Owns account-bound personal confirmation and original reference recovery without automatic writes. @module use-personal-invitation */
import { useCallback, useEffect, useRef, useState } from "react";
import { BROWSER_REQUEST_TRANSPORT_MESSAGE } from "@/src/constants/browser-request";
import type { PersonalInvitationPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-page-state";
import type { PersonalInvitationBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-browser-client";
import { personalInvitationApiClient } from "@/lib/academy-admissions/personal-invitation-api-client";
import { createPersonalInvitationBrowserScope } from "@/lib/academy-admissions/personal-invitation-scope";
import { readPersonalInvitationSubmissionIntent, writePersonalInvitationSubmissionIntent, clearPersonalInvitationSubmissionIntent, assertPersonalInvitationSubmissionStorage, type PersonalInvitationSubmissionIntent } from "@/lib/academy-admissions/personal-invitation-submission-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { omitKeys } from "@/lib/object-omit";
import { PERSONAL_INVITATION_UI_PHASE, PERSONAL_INVITATION_UI_COPY, PERSONAL_INVITATION_UI_TIMEOUT_MS } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";
import { PERSONAL_INVITATION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/personal-invitation-overview";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_OVERVIEW_STATE, ADMISSION_NEXT_ACTION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { applicantRefusalMessage, isAdmissionStateChangedRefusal } from "@/src/modules/academy-admissions/application/results/admission-applicant-refusal";
import { interruptedObservationMessage, readRecoveryFailureMessage, readSubmissionBlock, readSubmissionTarget, retirePersonalInvitation, settlePersonalInitialization, settlePersonalRequest, type PersonalPhase, type PersonalSubmissionInput } from "@/hooks/use-personal-invitation-support";

type PersonalInvitationOptions = { initialState: PersonalInvitationPageState; token: string; client?: PersonalInvitationBrowserClient };
type SubmissionResult = Awaited<ReturnType<PersonalInvitationBrowserClient["submit"]>>;
const UNOBSERVED = { kind: "settled", observed: false } as const, OBSERVED = { kind: "settled", observed: true } as const;

/** @param options - Safe SSR snapshot, route token and own application transport. @returns Every state, ref and setter of the workflow. */
function usePersonalInvitationState(options: PersonalInvitationOptions) {
  const client = options.client ?? personalInvitationApiClient;
  const [state, setState] = useState(options.initialState), [phase, setPhase] = useState<PersonalPhase>(PERSONAL_INVITATION_UI_PHASE.idle);
  const [ready, setReady] = useState(false), [personalScope, setPersonalScope] = useState<string | null>(null), [confirmed, setConfirmed] = useState(false), [accountChanged, setAccountChanged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null), [hasPending, setHasPending] = useState(false);
  /** The last consult proved the original absent or answered `started`: the reference holds no request data to resend it, so it may be discarded. */
  const [originalDiscardable, setOriginalDiscardable] = useState(false);
  const currentRef = useRef(state), scopeRef = useRef<string | null>(null), pendingRef = useRef<PersonalInvitationSubmissionIntent | null>(null), activeRef = useRef(false), busyRef = useRef(false), accountClosedRef = useRef(false), controllerRef = useRef<AbortController | null>(null);
  const live = useCallback((signal: AbortSignal) => activeRef.current && !signal.aborted, []);
  const publish = useCallback((next: PersonalInvitationPageState) => { currentRef.current = next; setState(next); }, []);
  return { client, token: options.token, state, phase, setPhase, ready, setReady, personalScope, setPersonalScope, confirmed, setConfirmed, accountChanged, setAccountChanged, errorMessage, setErrorMessage, feedback, setFeedback, hasPending, setHasPending, originalDiscardable, setOriginalDiscardable, currentRef, scopeRef, pendingRef, activeRef, busyRef, accountClosedRef, controllerRef, live, publish };
}
type PersonalInvitationState = ReturnType<typeof usePersonalInvitationState>;

/** @param workflow - Workflow state. @returns Outcome publishing, reference restoring, identity checks, the proposal read and reference clearing. */
function usePersonalInvitationCore(workflow: PersonalInvitationState) {
  const { client, token, currentRef, scopeRef, pendingRef, activeRef, accountClosedRef, live, publish, setHasPending, setErrorMessage, setAccountChanged, setReady, setConfirmed } = workflow;
  /** Publishes only an owned confirmed outcome before a follow-up read can fail; no fresh request dates or versions are invented. */
  const applyOutcome = useCallback((outcome: "pending" | "admitted" | "already_member", request?: AdmissionRequestDto) => {
    const snapshot = currentRef.current;
    if (snapshot.kind !== "ready" || snapshot.preview.state !== PERSONAL_INVITATION_OVERVIEW_STATE.available) return;
    const summary = omitKeys(snapshot.preview.overview, ["request"]), isPending = outcome === ADMISSION_OUTCOME.pending;
    publish({ ...snapshot, preview: { ...snapshot.preview, overview: { ...summary, state: isPending ? ADMISSION_OVERVIEW_STATE.pending : ADMISSION_OVERVIEW_STATE.alreadyMember, nextAction: isPending ? ADMISSION_NEXT_ACTION.viewRequest : ADMISSION_NEXT_ACTION.openAcademy, safeMessage: isPending ? PERSONAL_INVITATION_UI_COPY.pending : PERSONAL_INVITATION_UI_COPY.admitted, ...(request ? { request } : {}) } } });
  }, [currentRef, publish]);
  /** Reconciles references written by another document in this tab before any new canje or bfcache observation. */
  const restoreReference = useCallback(() => {
    const target = readSubmissionTarget(currentRef.current, scopeRef.current);
    if (!target) return;
    pendingRef.current = readPersonalInvitationSubmissionIntent(target.scope); setHasPending(Boolean(pendingRef.current));
  }, [currentRef, pendingRef, scopeRef, setHasPending]);
  /** Closes the account-bound view for good once another account owns the session. */
  const closeAccount = useCallback(() => { accountClosedRef.current = true; setAccountChanged(true); setReady(false); setConfirmed(false); setErrorMessage(PERSONAL_INVITATION_UI_COPY.accountChanged); }, [accountClosedRef, setAccountChanged, setConfirmed, setErrorMessage, setReady]);
  /** Checks one native account before and after every async result; no session or provider DTO reaches presentation. */
  const authorize = useCallback(async (signal: AbortSignal) => {
    const snapshot = currentRef.current;
    if (snapshot.kind !== "ready" || accountClosedRef.current) return false;
    const viewer = await client.viewer(signal);
    if (!activeRef.current || signal.aborted) return false;
    if (viewer.status !== "ready") { if (viewer.status === "failed") setErrorMessage(viewer.message); return false; }
    if ((viewer.value?.id ?? null) !== snapshot.viewerId) { closeAccount(); return false; }
    return true;
  }, [accountClosedRef, activeRef, client, closeAccount, currentRef, setErrorMessage]);
  /** Reads only the current proposal; a refreshed generic view cannot retain another account's academy hints. */
  const refresh = useCallback(async (signal: AbortSignal, proofId?: string) => {
    const snapshot = currentRef.current;
    if (snapshot.kind !== "ready" || !await authorize(signal) || !live(signal)) return false;
    const preview = await client.overview(token, proofId, signal);
    if (!live(signal) || !await authorize(signal) || !live(signal)) return false;
    if (preview.status !== "ready") { if (preview.status === "failed") setErrorMessage(preview.message); return false; }
    if (preview.value.viewerId !== snapshot.viewerId) { closeAccount(); return false; }
    if (snapshot.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available && preview.value.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available && preview.value.preview.overview.tribe.slug !== snapshot.preview.overview.tribe.slug) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return false; }
    publish({ ...snapshot, preview: preview.value.preview, renderedAt: new Date().toISOString() });
    return true;
  }, [authorize, client, closeAccount, currentRef, live, publish, setErrorMessage, token]);
  /** Clears a terminal reference only after an actual owned result; storage errors keep new writes closed. */
  const clear = useCallback(() => {
    const intent = pendingRef.current;
    if (!intent) return true;
    try { clearPersonalInvitationSubmissionIntent(intent); pendingRef.current = null; setHasPending(false); return true; }
    catch { setReady(false); setErrorMessage(PERSONAL_INVITATION_UI_COPY.storage); return false; }
  }, [pendingRef, setErrorMessage, setHasPending, setReady]);
  return { applyOutcome, restoreReference, authorize, refresh, clear };
}
type PersonalInvitationCore = ReturnType<typeof usePersonalInvitationCore>;

/** @param workflow - Workflow state. @param core - Shared steps. @returns Read-only recovery of the original and serialized observations. */
function usePersonalInvitationRecovery(workflow: PersonalInvitationState, core: PersonalInvitationCore) {
  const { client, live, currentRef, scopeRef, pendingRef, activeRef, busyRef, controllerRef, setPhase, setErrorMessage, setFeedback, setConfirmed, setReady, setOriginalDiscardable } = workflow;
  const { authorize, clear, applyOutcome, refresh, restoreReference } = core;
  /** @param intent - Stored original. @param signal - Read lifetime. @returns The completed original, or whether the read still counts as an observation. */
  const readOriginal = useCallback(async (intent: PersonalInvitationSubmissionIntent, signal: AbortSignal) => {
    const result = await client.operation(intent.slug, intent.operationId, signal);
    if (!live(signal) || !await authorize(signal) || !live(signal)) return UNOBSERVED;
    if (result.status !== "ready") { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(readRecoveryFailureMessage(result)); setOriginalDiscardable(result.status === "failed" && result.code === ADMISSION_ERROR_CODE.resourceUnavailable); return UNOBSERVED; }
    const parsed = admissionOperationRecoverySchema.safeParse(result.value);
    if (!parsed.success || parsed.data.type !== ADMISSION_OPERATION_TYPE.submit || parsed.data.operationId.toLowerCase() !== intent.operationId.toLowerCase()) { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return UNOBSERVED; }
    if (parsed.data.state === OPERATION_STATE.started) { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(PERSONAL_INVITATION_UI_COPY.started); setOriginalDiscardable(true); return OBSERVED; }
    const original = parsed.data.result;
    if (original.outcome !== ADMISSION_OUTCOME.denied && original.operationId.toLowerCase() !== intent.operationId.toLowerCase() || original.outcome === ADMISSION_OUTCOME.denied && original.admissionRequestId !== null) { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return UNOBSERVED; }
    return { kind: "completed", original } as const;
  }, [authorize, client, live, setErrorMessage, setOriginalDiscardable, setPhase]);
  /** Reads exactly the original namespace/id without a new POST or an invented accepted result. */
  const recover = useCallback(async (signal: AbortSignal) => {
    const intent = pendingRef.current;
    if (!intent || !await authorize(signal) || !live(signal)) return false;
    setOriginalDiscardable(false);
    const read = await readOriginal(intent, signal);
    if (read.kind === "settled") return read.observed;
    const { original } = read;
    if (!clear()) return false;
    if (original.outcome !== ADMISSION_OUTCOME.denied) { applyOutcome(original.outcome, original.requestSnapshot); setFeedback(original.outcome === ADMISSION_OUTCOME.pending ? PERSONAL_INVITATION_UI_COPY.pending : PERSONAL_INVITATION_UI_COPY.admitted); }
    else setErrorMessage(ADMISSION_ERROR_MESSAGE[original.code]);
    await refresh(signal);
    if (live(signal)) setPhase(PERSONAL_INVITATION_UI_PHASE.idle);
    return live(signal);
  }, [applyOutcome, authorize, clear, live, pendingRef, readOriginal, refresh, setErrorMessage, setFeedback, setOriginalDiscardable, setPhase]);
  /** Serializes observations with the same deadline/cancellation owner as explicit mutation actions. */
  const observe = useCallback(async (proofId?: string) => {
    if (busyRef.current || !activeRef.current) return;
    const request = new AbortController(); controllerRef.current = request; busyRef.current = true;
    setPhase(PERSONAL_INVITATION_UI_PHASE.reading); setConfirmed(false); setErrorMessage(null); setFeedback(null);
    const deadline = window.setTimeout(() => request.abort(), PERSONAL_INVITATION_UI_TIMEOUT_MS);
    try {
      restoreReference();
      const observed = pendingRef.current ? await recover(request.signal) : await refresh(request.signal, proofId);
      if (!observed || !live(request.signal)) return;
      const target = readSubmissionTarget(currentRef.current, scopeRef.current);
      if (target) assertPersonalInvitationSubmissionStorage(target.scope);
      if (await authorize(request.signal) && live(request.signal)) setReady(true);
      if (!pendingRef.current && live(request.signal)) setPhase(PERSONAL_INVITATION_UI_PHASE.idle);
    }
    catch { if (live(request.signal)) setErrorMessage(BROWSER_REQUEST_TRANSPORT_MESSAGE); }
    finally { window.clearTimeout(deadline); settlePersonalRequest({ controllerRef, busyRef, activeRef, pendingRef }, { request, runningPhase: PERSONAL_INVITATION_UI_PHASE.reading, abortedMessage: interruptedObservationMessage, setPhase, setErrorMessage }); }
  }, [activeRef, authorize, busyRef, controllerRef, currentRef, live, pendingRef, recover, refresh, restoreReference, scopeRef, setConfirmed, setErrorMessage, setFeedback, setPhase, setReady]);
  return { recover, observe };
}

/** @param workflow - Workflow state. @param core - Shared steps. @param recovery - Original recovery and observations. Initializes the route scope once per mount and observes restored documents. */
function usePersonalInvitationLifecycle(workflow: PersonalInvitationState, core: PersonalInvitationCore, recovery: { recover: (signal: AbortSignal) => Promise<boolean>; observe: () => Promise<void> }) {
  const { token, live, activeRef, controllerRef, busyRef, scopeRef, currentRef, pendingRef, setPersonalScope, setPhase, setReady, setErrorMessage, setConfirmed } = workflow;
  const { authorize, restoreReference } = core;
  const { recover, observe } = recovery;
  useEffect(() => {
    activeRef.current = true;
    const initialization = new AbortController(); controllerRef.current = initialization; busyRef.current = true;
    const deadline = window.setTimeout(() => initialization.abort(), PERSONAL_INVITATION_UI_TIMEOUT_MS);
    const initialize = async () => {
      try {
        const digest = await createPersonalInvitationBrowserScope(token);
        if (!live(initialization.signal)) return;
        scopeRef.current = digest; setPersonalScope(digest);
        const snapshot = currentRef.current;
        if (snapshot.kind !== "ready" || !await authorize(initialization.signal) || !live(initialization.signal)) return;
        if (snapshot.viewerId && snapshot.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available) {
          restoreReference();
          if (pendingRef.current) { setPhase(PERSONAL_INVITATION_UI_PHASE.reading); await recover(initialization.signal); }
        }
        if (live(initialization.signal)) setReady(true);
      } catch { if (live(initialization.signal)) setErrorMessage(PERSONAL_INVITATION_UI_COPY.storage); }
      finally { window.clearTimeout(deadline); settlePersonalInitialization({ controllerRef, busyRef, activeRef, pendingRef }, initialization, { setPhase, setErrorMessage }); }
    };
    void initialize();
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) { setReady(false); setConfirmed(false); void observe(); } };
    window.addEventListener("pageshow", onPageShow);
    // Activity retains state while retiring effects; invalidate freshness before this draft can reappear.
    return () => { setReady(false); setConfirmed(false); retirePersonalInvitation({ activeRef, controllerRef, busyRef }, initialization); window.clearTimeout(deadline); window.removeEventListener("pageshow", onPageShow); };
  }, [activeRef, authorize, busyRef, controllerRef, currentRef, live, observe, pendingRef, recover, restoreReference, scopeRef, setConfirmed, setErrorMessage, setPersonalScope, setPhase, setReady, token]);
}

/** @param workflow - Workflow state. @param core - Shared steps. @returns The explicit submission and the account change. */
function usePersonalInvitationActions(workflow: PersonalInvitationState, core: PersonalInvitationCore) {
  const { client, token, ready, confirmed, live, currentRef, scopeRef, pendingRef, activeRef, busyRef, controllerRef, setPhase, setErrorMessage, setFeedback, setConfirmed, setHasPending, setReady } = workflow;
  const { authorize, restoreReference, clear, applyOutcome, refresh } = core;
  /**
   * @param result - Confirmed refusal of the original. @param signal - Request lifetime. Clears the original and shows the refusal; when the rules,
   * the invitation or the proof changed after the page loaded, the page reads them again and asks for a new confirmation, so another try never resends the refused version.
   */
  const settleRefusal = useCallback(async (result: Extract<SubmissionResult, { status: "failed" }>, signal: AbortSignal) => {
    if (!clear()) return;
    if (isAdmissionStateChangedRefusal(result.code)) { setConfirmed(false); await refresh(signal); }
    if (!live(signal)) return;
    setErrorMessage(applicantRefusalMessage(result.code, result.message)); setPhase(PERSONAL_INVITATION_UI_PHASE.idle);
  }, [clear, live, refresh, setConfirmed, setErrorMessage, setPhase]);
  /** @param result - Reply to the dispatched original. @param operationId - Its identity. @param signal - Request lifetime. Publishes an owned outcome, clears a definite failure and keeps anything else uncertain. */
  const applySubmissionResult = useCallback(async (result: SubmissionResult, operationId: string, signal: AbortSignal) => {
    if (result.status === "ready" && result.value.operationId.toLowerCase() !== operationId.toLowerCase()) { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    if (result.status === "ready" && !("state" in result.value)) {
      if (!clear()) return;
      applyOutcome(result.value.outcome, result.value.outcome === ADMISSION_OUTCOME.pending ? result.value.request : undefined);
      setConfirmed(false); setFeedback(result.value.safeMessage);
      await refresh(signal); if (live(signal)) setPhase(PERSONAL_INVITATION_UI_PHASE.idle);
    } else if (result.status === "failed" && !result.uncertain) await settleRefusal(result, signal);
    else { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(PERSONAL_INVITATION_UI_COPY.uncertain); }
  }, [applyOutcome, clear, live, refresh, setConfirmed, setErrorMessage, setFeedback, setPhase, settleRefusal]);
  /** @param scope - Viewer, tribe and route scope of the submission. @param input - Requested submission. @param signal - Request lifetime. Saves original metadata before dispatch. */
  const dispatchSubmission = useCallback(async (scope: Omit<PersonalInvitationSubmissionIntent, "operationId">, input: PersonalSubmissionInput, signal: AbortSignal) => {
    if (!await authorize(signal) || !live(signal)) return;
    restoreReference();
    if (pendingRef.current) { setConfirmed(false); setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(PERSONAL_INVITATION_UI_COPY.uncertain); return; }
    const operationId = newAdmissionOperationId(), intent = { ...scope, operationId };
    writePersonalInvitationSubmissionIntent(intent); pendingRef.current = intent; setHasPending(true);
    const result = await client.submit(intent.slug, { ...input, operationId, confirmed: true, invitationToken: token }, signal);
    if (!live(signal) || !await authorize(signal) || !live(signal)) return;
    await applySubmissionResult(result, operationId, signal);
  }, [applySubmissionResult, authorize, client, live, pendingRef, restoreReference, setConfirmed, setErrorMessage, setHasPending, setPhase, token]);
  /** Saves original metadata before dispatch; uncertain/aborted results cannot enable another canje. */
  const submit = useCallback(async (input: PersonalSubmissionInput) => {
    const target = readSubmissionTarget(currentRef.current, scopeRef.current);
    if (!ready || busyRef.current || pendingRef.current || !target) return;
    if (!confirmed) { setErrorMessage(PERSONAL_INVITATION_UI_COPY.confirmationRequired); return; }
    const block = readSubmissionBlock(target.overview, input);
    if (block) { setErrorMessage(block); return; }
    const request = new AbortController(); controllerRef.current = request; busyRef.current = true; setPhase(PERSONAL_INVITATION_UI_PHASE.submitting); setErrorMessage(null); setFeedback(null);
    const deadline = window.setTimeout(() => request.abort(), PERSONAL_INVITATION_UI_TIMEOUT_MS);
    try { await dispatchSubmission(target.scope, input, request.signal); }
    catch { if (live(request.signal)) { const unresolved = Boolean(pendingRef.current); setErrorMessage(unresolved ? PERSONAL_INVITATION_UI_COPY.uncertain : PERSONAL_INVITATION_UI_COPY.storage); setPhase(unresolved ? PERSONAL_INVITATION_UI_PHASE.uncertain : PERSONAL_INVITATION_UI_PHASE.idle); } }
    finally { window.clearTimeout(deadline); settlePersonalRequest({ controllerRef, busyRef, activeRef, pendingRef }, { request, runningPhase: PERSONAL_INVITATION_UI_PHASE.submitting, abortedMessage: () => PERSONAL_INVITATION_UI_COPY.uncertain, setPhase, setErrorMessage }); }
  }, [activeRef, busyRef, confirmed, controllerRef, currentRef, dispatchSubmission, live, pendingRef, ready, scopeRef, setErrorMessage, setFeedback, setPhase]);
  /** Changes global account only after an explicit click; the caller navigates to a preserved internal return. */
  const changeAccount = useCallback(async () => {
    if (busyRef.current || !activeRef.current) return false;
    const request = new AbortController(); controllerRef.current = request; busyRef.current = true; setPhase(PERSONAL_INVITATION_UI_PHASE.changingAccount); setErrorMessage(null); setConfirmed(false);
    const deadline = window.setTimeout(() => request.abort(), PERSONAL_INVITATION_UI_TIMEOUT_MS);
    try {
      const result = await client.changeAccount(request.signal);
      if (!live(request.signal)) return false;
      if (result.status === "ready") { setReady(false); return true; }
      setErrorMessage(result.status === "failed" ? result.message : BROWSER_REQUEST_TRANSPORT_MESSAGE); return false;
    } catch { if (live(request.signal)) setErrorMessage(BROWSER_REQUEST_TRANSPORT_MESSAGE); return false; }
    finally { window.clearTimeout(deadline); if (controllerRef.current === request) { busyRef.current = false; controllerRef.current = null; if (activeRef.current) setPhase(PERSONAL_INVITATION_UI_PHASE.idle); } }
  }, [activeRef, busyRef, client, controllerRef, live, setConfirmed, setErrorMessage, setPhase, setReady]);
  const changeConfirmation = useCallback((value: boolean) => { setConfirmed(value); setErrorMessage(null); setFeedback(null); }, [setConfirmed, setErrorMessage, setFeedback]);
  return { submit, changeAccount, changeConfirmation };
}

/** @param options - Safe SSR snapshot, route token and own application transport. @returns Controlled state and explicit actions; opening, recovery and timers never submit. */
export function usePersonalInvitation(options: PersonalInvitationOptions) {
  const workflow = usePersonalInvitationState(options);
  const core = usePersonalInvitationCore(workflow);
  const { recover, observe } = usePersonalInvitationRecovery(workflow, core);
  usePersonalInvitationLifecycle(workflow, core, { recover, observe });
  const { submit, changeAccount, changeConfirmation } = usePersonalInvitationActions(workflow, core);
  const { state, ready, personalScope, confirmed, accountChanged, phase, errorMessage, feedback, hasPending, originalDiscardable, setOriginalDiscardable, setErrorMessage, setFeedback, setPhase, busyRef, pendingRef } = workflow;
  /**
   * Forgets an original the last consult proved absent or still `started`. Its reference holds no request data, so it cannot be resent:
   * the invitation is read again, which shows whether that original registered the admission.
   */
  const discardOriginal = useCallback(async () => {
    if (busyRef.current || !pendingRef.current || !originalDiscardable || !core.clear()) return;
    setOriginalDiscardable(false); setErrorMessage(null); setPhase(PERSONAL_INVITATION_UI_PHASE.idle);
    await observe();
    setFeedback(PERSONAL_INVITATION_UI_COPY.discarded);
  }, [busyRef, core, observe, originalDiscardable, pendingRef, setErrorMessage, setFeedback, setOriginalDiscardable, setPhase]);
  return { state, ready, personalScope, confirmed, setConfirmed: changeConfirmation, accountChanged, phase, errorMessage, feedback, hasPending, originalDiscardable: hasPending && originalDiscardable, discardOriginal, authorize: core.authorize, read: observe, submit, changeAccount };
}
