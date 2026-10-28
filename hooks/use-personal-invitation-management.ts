"use client";
/** Owns viewer-scoped administrative proposals, one-view material and read-only original recovery. @module use-personal-invitation-management */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@golfo/ui";
import { startWriteToast, type WriteToast } from "@/lib/toasts/write-toast";
import type { PersonalInvitationManagementPageState, PersonalInvitationManagementBrowserQuery } from "@/src/modules/academy-admissions/application/results/personal-invitation-management-page-state";
import type { PersonalInvitationManagementBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import type { PersonalInvitationManagementDraft, PersonalInvitationManagementReference } from "@/src/modules/academy-admissions/application/commands/personal-invitation-management-intent";
import type { PersonalInvitationManagementResult } from "@/src/modules/academy-admissions/application/results/admission-resource-result";
import { emptyPersonalInvitationManagementDraft, preparePersonalInvitationManagementIntent } from "@/src/modules/academy-admissions/application/commands/prepare-personal-invitation-management-intent";
import { createPersonalInvitationManagementApiClient } from "@/lib/academy-admissions/personal-invitation-management-api-client";
import { readPersonalInvitationManagementReference, writePersonalInvitationManagementReference } from "@/lib/academy-admissions/personal-invitation-management-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { PERSONAL_INVITATION_MANAGEMENT_COPY as COPY, PERSONAL_INVITATION_MANAGEMENT_PHASE as PHASE, PERSONAL_INVITATION_MANAGEMENT_MODE as MODE, PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS, PERSONAL_INVITATION_MANAGEMENT_SELECTION_MISSING, PERSONAL_INVITATION_MANAGEMENT_REPLACEMENT_UNAVAILABLE } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";
import { ADMISSION_INVITATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { appendAdmissionListPage } from "@/lib/academy-admissions/admission-list-pages";
import { isAdmissionAccessLoss } from "@/lib/academy-admissions/admission-access-loss";
import { requireReadyValue } from "@/hooks/require-ready-value";
import { closeManagementScope, createManagementFailure, interruptedManagementMessage, readManagementOutcome, referenceForManagementIntent, settleManagementRun, type PersonalInvitationManagementPhase } from "@/hooks/use-personal-invitation-management-support";

type ManagementOptions = { initialState: PersonalInvitationManagementPageState; client?: PersonalInvitationManagementBrowserClient };
type ManagementOutcome = { state: "started" | "completed"; operationId: string; result?: unknown; invitationUrl?: string };
type ManagementRun = (action: (signal: AbortSignal, scope: number) => Promise<void>, writing?: boolean, reportReadFailure?: (message: string) => void) => Promise<void>;
type ManagementConsume = (reference: PersonalInvitationManagementReference, outcome: ManagementOutcome, signal: AbortSignal, scope: number) => Promise<void>;
const SCOPE = "PersonalInvitationManagement scope", CURRENT_STATE = "PersonalInvitationManagement state";

/** @param options - Guarded SSR snapshot and optional own ports. @returns Every state, ref and setter of the workflow. */
function useManagementState(options: ManagementOptions) {
  const initial = options.initialState.kind === "ready" ? options.initialState : null;
  const client = useMemo(() => options.client ?? createPersonalInvitationManagementApiClient({ origin: () => initial?.publicOrigin ?? "" }), [initial, options.client]);
  const [state, setState] = useState(initial), [draft, setDraft] = useState<PersonalInvitationManagementDraft | null>(() => initial ? emptyPersonalInvitationManagementDraft(initial) : null);
  const [confirmed, setConfirmed] = useState(false), [ready, setReady] = useState(false), [privateVisible, setPrivateVisible] = useState(true), [phase, setPhase] = useState<PersonalInvitationManagementPhase>(PHASE.checking);
  const [pending, setPending] = useState<PersonalInvitationManagementReference | null>(null), [errorMessage, setErrorMessage] = useState<string | null>(null), [fieldError, setFieldError] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null), [conflict, setConflict] = useState(false), [needsCurrent, setNeedsCurrent] = useState(false), [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const mountedRef = useRef(false), closedRef = useRef(false), generationRef = useRef(0), busyRef = useRef(false), controllerRef = useRef<AbortController | null>(null), pendingRef = useRef<PersonalInvitationManagementReference | null>(null), draftRef = useRef(draft), stateRef = useRef(state);
  const [selectionBlocked, setSelectionBlocked] = useState(false), [step, setStep] = useState(0), writeToastRef = useRef<WriteToast | null>(null);
  /** A focus recheck in flight and the revision of explicit operations: any newer operation supersedes it. */
  const focusCheckRef = useRef<AbortController | null>(null), operationRevisionRef = useRef(0);
  /** «Ver más» adds pages below the shown ones; its progress and failure stay next to its button. */
  const [loadingMore, setLoadingMore] = useState(false), [moreError, setMoreError] = useState<string | null>(null), loadedPagesRef = useRef(0);
  const live = useCallback((signal: AbortSignal, scope: number) => mountedRef.current && generationRef.current === scope && !signal.aborted, []);
  return { initial, client, state, setState, draft, setDraft, confirmed, setConfirmed, ready, setReady, privateVisible, setPrivateVisible, phase, setPhase, pending, setPending, errorMessage, setErrorMessage, fieldError, setFieldError, statusMessage, setStatusMessage, conflict, setConflict, needsCurrent, setNeedsCurrent, invitationUrl, setInvitationUrl, mountedRef, closedRef, generationRef, busyRef, controllerRef, pendingRef, draftRef, stateRef, selectionBlocked, setSelectionBlocked, step, setStep, writeToastRef, focusCheckRef, operationRevisionRef, loadingMore, setLoadingMore, moreError, setMoreError, loadedPagesRef, live };
}
type ManagementState = ReturnType<typeof useManagementState>;

/** @param workflow - Workflow state. @returns Viewer closing, identity checks, durable references, failure reporting and the page read. */
function useManagementCore(workflow: ManagementState) {
  const { initial, client, live, closedRef, pendingRef, stateRef, loadedPagesRef, setPrivateVisible, setReady, setConfirmed, setInvitationUrl, setPhase, setErrorMessage, setPending, setState, setNeedsCurrent } = workflow;
  /** A changed viewer permanently closes this mounted scope and removes transient private material. */
  const close = useCallback(() => { closedRef.current = true; setPrivateVisible(false); setReady(false); setConfirmed(false); setInvitationUrl(null); setPhase(PHASE.closed); setErrorMessage(COPY.account); }, [closedRef, setConfirmed, setErrorMessage, setInvitationUrl, setPhase, setPrivateVisible, setReady]);
  /** @param signal - This observation's lifetime. @param scope - Mounted generation. @returns Whether the actual native viewer still owns this page. */
  const authorize = useCallback(async (signal: AbortSignal, scope: number) => {
    if (!initial || closedRef.current || !live(signal, scope)) return false;
    const viewer = await client.viewer(signal);
    if (!live(signal, scope) || viewer.status === "aborted") return false;
    if (viewer.status !== "ready" || viewer.value?.id !== initial.viewerId) { close(); return false; }
    return true;
  }, [client, close, closedRef, initial, live]);
  /** @param reference - Original progress or confirmed absence. @returns Whether storage accepted the reference before dispatch. */
  const persist = useCallback((reference: PersonalInvitationManagementReference | null) => {
    if (!initial) return false;
    try { writePersonalInvitationManagementReference(initial.viewerId, initial.slug, reference); pendingRef.current = reference; setPending(reference); return true; }
    catch { setErrorMessage(COPY.storage); return false; }
  }, [initial, pendingRef, setErrorMessage, setPending]);
  /** Adopts original progress from another document without restoring a draft or consent. */
  const observeReference = useCallback(() => {
    if (!initial) return null;
    const reference = readPersonalInvitationManagementReference(initial.viewerId, initial.slug);
    if (reference) { pendingRef.current = reference; setPending(reference); setConfirmed(false); setInvitationUrl(null); }
    return reference;
  }, [initial, pendingRef, setConfirmed, setInvitationUrl, setPending]);
  /** @param failure - Safe own error. @returns Whether actual authority was lost, requiring a new document. */
  const report = useCallback((failure: { code: string; message: string }) => {
    if (isAdmissionAccessLoss(failure.code)) { close(); return true; }
    setErrorMessage(failure.message); return false;
  }, [close, setErrorMessage]);
  /** @param query - Own bounded filters. @param signal - Observation lifetime. @param scope - Mounted generation. @returns Whether fresh native page facts were published for this initial viewer. */
  const refresh = useCallback(async (query: PersonalInvitationManagementBrowserQuery, signal: AbortSignal, scope: number) => {
    const readyScope = requireReadyValue(initial, SCOPE);
    const result = await client.page(readyScope.slug, query, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return false;
    if (result.status !== "ready") { if (result.status === "failed") report(result); return false; }
    if (result.value.viewerId !== readyScope.viewerId || result.value.tribeId !== readyScope.tribeId) { close(); return false; }
    loadedPagesRef.current = 0; stateRef.current = result.value; setState(stateRef.current); setNeedsCurrent(false); return true;
  }, [authorize, client, close, initial, live, loadedPagesRef, report, setNeedsCurrent, setState, stateRef]);
  return { close, authorize, persist, observeReference, report, refresh };
}
type ManagementCore = ReturnType<typeof useManagementCore>;

/** @param workflow - Workflow state. @param core - Shared steps. @returns The bounded action runner and the original consumer. */
function useManagementRunner(workflow: ManagementState, core: ManagementCore) {
  const { initial, live, closedRef, busyRef, generationRef, controllerRef, focusCheckRef, operationRevisionRef, writeToastRef, pendingRef, mountedRef, stateRef, draftRef, setErrorMessage, setStatusMessage, setFieldError, setPhase, setPending, setConfirmed, setNeedsCurrent, setConflict, setInvitationUrl, setStep, setDraft } = workflow;
  const { authorize, persist, refresh } = core;
  /**
   * @param action - Explicit observation or write. @param writing - Whether the user confirmed a mutation.
   * @param reportReadFailure - Where a read's transport failure is shown; the page alert by default.
   * @returns After bounded cleanup; unresolved references survive timeout or cancellation.
   */
  const run: ManagementRun = useCallback(async (action, writing = false, reportReadFailure) => {
    if (!initial || closedRef.current || busyRef.current) return;
    const next = new AbortController(), scope = generationRef.current; controllerRef.current?.abort(); controllerRef.current = next; busyRef.current = true;
    focusCheckRef.current?.abort(); focusCheckRef.current = null; operationRevisionRef.current += 1;
    // A write's progress and outcome are its own toast; an unconfirmed original stays on screen.
    const timeout = window.setTimeout(() => next.abort(), PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS), notice = writing ? startWriteToast(COPY.saving) : null; writeToastRef.current = notice;
    const fail = createManagementFailure({ notice, reportReadFailure, pendingRef, setErrorMessage });
    setErrorMessage(null); setStatusMessage(null); setFieldError(null); setPhase(writing ? PHASE.writing : PHASE.reading);
    try { if (await authorize(next.signal, scope)) await action(next.signal, scope); }
    catch { if (live(next.signal, scope)) fail(interruptedManagementMessage(pendingRef)); }
    finally {
      window.clearTimeout(timeout);
      settleManagementRun({ controllerRef, busyRef, mountedRef, generationRef, closedRef, pendingRef, writeToastRef }, { next, scope, notice, fail, setPhase });
    }
  }, [authorize, busyRef, closedRef, controllerRef, focusCheckRef, generationRef, initial, live, mountedRef, operationRevisionRef, pendingRef, setErrorMessage, setFieldError, setPhase, setStatusMessage, writeToastRef]);
  /** @param code - Recorded denial. @param stored - Whether the cleared reference was stored. A conflict blocks the form and stays next to it; any other denial is the write's failure. */
  const rejectOriginal = useCallback((code: keyof typeof ADMISSION_ERROR_MESSAGE, stored: boolean) => {
    const blocking = code === ADMISSION_ERROR_CODE.invitationConflict;
    setConflict(blocking); if (stored) setNeedsCurrent(false);
    if (blocking || !writeToastRef.current) setErrorMessage(ADMISSION_ERROR_MESSAGE[code]); else writeToastRef.current.announce({ kind: "error", message: ADMISSION_ERROR_MESSAGE[code] });
  }, [setConflict, setErrorMessage, setNeedsCurrent, writeToastRef]);
  /** Publishes the confirmed original before any following read, so a failed GET cannot reopen a write. */
  const consume: ManagementConsume = useCallback(async (reference, outcome, signal, scope) => {
    if (outcome.operationId !== reference.operationId) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    if (outcome.state === OPERATION_STATE.started) { setErrorMessage(COPY.started); return; }
    const read = readManagementOutcome(reference, outcome.result);
    if (!read) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    pendingRef.current = null; setPending(null); setConfirmed(false); setNeedsCurrent(true);
    const stored = persist(null);
    if (read.kind === "denied") { rejectOriginal(read.code, stored); return; }
    setInvitationUrl(outcome.invitationUrl ?? null); setStep(0);
    // A lost one-time link stays on screen: the leader has to act on it.
    if (reference.type === REAUTHENTICATION_OPERATION.createPersonalInvitation && !outcome.invitationUrl) setStatusMessage(COPY.lostUrl);
    if (writeToastRef.current) writeToastRef.current.announce({ kind: "success", message: COPY.saved }); else toast.success(COPY.recovered);
    if (!stored) return;
    if (!await refresh(requireReadyValue(stateRef.current, CURRENT_STATE).query, signal, scope) && live(signal, scope) && !closedRef.current) { setErrorMessage(COPY.freshFailed); return; }
    const currentState = requireReadyValue(stateRef.current, CURRENT_STATE); draftRef.current = emptyPersonalInvitationManagementDraft(currentState); setDraft(draftRef.current); setConflict(false);
  }, [closedRef, draftRef, live, pendingRef, persist, refresh, rejectOriginal, setConfirmed, setConflict, setDraft, setErrorMessage, setInvitationUrl, setNeedsCurrent, setPending, setStatusMessage, setStep, stateRef, writeToastRef]);
  return { run, consume };
}

/** @param workflow - Workflow state. @param core - Shared steps. @param run - Action runner. Hydrates the scope and rechecks it when the document is restored or focused again. */
function useManagementLifecycle(workflow: ManagementState, core: ManagementCore, run: ManagementRun) {
  const { initial, client, live, mountedRef, generationRef, controllerRef, focusCheckRef, closedRef, busyRef, stateRef, pendingRef, operationRevisionRef, loadedPagesRef, setReady, setConfirmed, setPhase, setErrorMessage, setPrivateVisible, setInvitationUrl, setState } = workflow;
  const { authorize, close, observeReference, refresh } = core;
  useEffect(() => {
    mountedRef.current = true; generationRef.current += 1; const scope = generationRef.current, hydration = new AbortController();
    const timeout = window.setTimeout(() => hydration.abort(), PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS);
    queueMicrotask(() => { void (async () => {
      if (!await authorize(hydration.signal, scope)) return;
      observeReference(); if (!live(hydration.signal, scope)) return; setReady(true); setConfirmed(false); setPhase(pendingRef.current ? PHASE.uncertain : PHASE.idle);
    })().catch(() => { if (live(hydration.signal, scope)) { setErrorMessage(COPY.storage); setPhase(PHASE.idle); } }).finally(() => { window.clearTimeout(timeout); if (hydration.signal.aborted && mountedRef.current && generationRef.current === scope) { setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(PHASE.idle); } }); });
    /** Restoring a document rereads identity/progress and never restarts its original mutation. */
    const restored = (event: PageTransitionEvent) => { if (!event.persisted || !mountedRef.current || closedRef.current || busyRef.current) return; setPrivateVisible(false); setConfirmed(false); setInvitationUrl(null); void run(async (signal, observedScope) => { observeReference(); if (await refresh(requireReadyValue(stateRef.current, CURRENT_STATE).query, signal, observedScope) && !closedRef.current) setPrivateVisible(true); }); };
    /**
     * Returning to the window rechecks the account and the tribe authority behind the page read: losing either closes the private view.
     * The one-time link, its feedback and the draft stay for an unchanged authorized leader, and a transient read failure stays silent.
     */
    const regainedFocus = () => {
      if (!mountedRef.current || closedRef.current || busyRef.current || !stateRef.current) return;
      focusCheckRef.current?.abort();
      const check = new AbortController(), checkScope = generationRef.current, revision = operationRevisionRef.current, checkTimeout = window.setTimeout(() => check.abort(), PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS);
      focusCheckRef.current = check;
      void (async () => {
        if (!await authorize(check.signal, checkScope)) return;
        const readyScope = requireReadyValue(initial, SCOPE);
        const result = await client.page(readyScope.slug, requireReadyValue(stateRef.current, CURRENT_STATE).query, check.signal);
        // An explicit read or write started meanwhile owns the page state: this older answer must not overwrite it.
        if (!live(check.signal, checkScope) || closedRef.current || busyRef.current || operationRevisionRef.current !== revision) return;
        if (result.status === "failed") { if (isAdmissionAccessLoss(result.code)) close(); return; }
        if (result.status !== "ready") return;
        if (result.value.viewerId !== readyScope.viewerId || result.value.tribeId !== readyScope.tribeId) { close(); return; }
        loadedPagesRef.current = 0; stateRef.current = result.value; setState(stateRef.current); observeReference();
      })().catch(() => undefined).finally(() => { window.clearTimeout(checkTimeout); if (focusCheckRef.current === check) focusCheckRef.current = null; });
    };
    window.addEventListener("pageshow", restored);
    window.addEventListener("focus", regainedFocus);
    return () => { closeManagementScope({ mountedRef, generationRef, controllerRef, focusCheckRef }, hydration); window.clearTimeout(timeout); window.removeEventListener("pageshow", restored); window.removeEventListener("focus", regainedFocus); busyRef.current = false; };
  }, [authorize, busyRef, client, close, closedRef, controllerRef, focusCheckRef, generationRef, initial, live, loadedPagesRef, mountedRef, observeReference, operationRevisionRef, pendingRef, refresh, run, setConfirmed, setErrorMessage, setInvitationUrl, setPhase, setPrivateVisible, setReady, setState, stateRef]);
}

/** @param workflow - Workflow state. @param core - Shared steps. @param writes - Action runner and original consumer. @returns The confirmed save and the read of the original. */
function useManagementWrites(workflow: ManagementState, core: ManagementCore, writes: { run: ManagementRun; consume: ManagementConsume }) {
  const { initial, client, ready, confirmed, needsCurrent, conflict, live, busyRef, closedRef, pendingRef, stateRef, draftRef, writeToastRef, setFieldError, setErrorMessage, setPending, setNeedsCurrent, setConfirmed, setConflict } = workflow;
  const { authorize, close, observeReference, persist, report } = core;
  const { run, consume } = writes;
  /** @param result - Definite write failure. Clears the original; a conflict blocks the form, any other failure is the write's toast. */
  const rejectSave = useCallback((result: { code: string; message: string }) => {
    pendingRef.current = null; setPending(null); if (!persist(null)) { setNeedsCurrent(true); return; } setConfirmed(false); if (report(result)) return;
    const blocking = result.code === ADMISSION_ERROR_CODE.invitationConflict; setConflict(blocking);
    if (!blocking) { setErrorMessage(null); writeToastRef.current?.announce({ kind: "error", message: result.message }); }
  }, [pendingRef, persist, report, setConfirmed, setConflict, setErrorMessage, setNeedsCurrent, setPending, writeToastRef]);
  const save = useCallback(async () => {
    if (!ready || !confirmed || busyRef.current || closedRef.current || pendingRef.current || needsCurrent || conflict || !stateRef.current || !draftRef.current) { if (!confirmed) setFieldError(COPY.confirm); return; }
    let intent;
    try { intent = preparePersonalInvitationManagementIntent(stateRef.current, draftRef.current, newAdmissionOperationId(), new Date()); }
    catch { setFieldError(COPY.invalid); return; }
    await run(async (signal, scope) => {
      if (observeReference()) { setErrorMessage(COPY.uncertain); return; }
      const reference = referenceForManagementIntent(intent);
      if (!persist(reference)) return;
      const readyScope = requireReadyValue(initial, SCOPE);
      const result = await client.write(readyScope.slug, intent, signal);
      if (!live(signal, scope) || !await authorize(signal, scope)) return;
      if (result.status === "ready") { if (result.value.viewerId !== readyScope.viewerId) { close(); return; } await consume(reference, result.value.outcome, signal, scope); }
      else if (result.status === "failed" && !result.uncertain) rejectSave(result);
      else setErrorMessage(COPY.uncertain);
    }, true);
  }, [authorize, busyRef, client, close, closedRef, confirmed, conflict, consume, draftRef, initial, live, needsCurrent, observeReference, pendingRef, persist, ready, rejectSave, run, setErrorMessage, setFieldError, stateRef]);
  const readOriginal = useCallback(() => run(async (signal, scope) => {
    observeReference(); const reference = pendingRef.current; if (!reference) return;
    const readyScope = requireReadyValue(initial, SCOPE);
    const result = await client.operation(readyScope.slug, reference.operationId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready" && result.value.viewerId !== readyScope.viewerId) { close(); return; }
    if (result.status === "ready" && result.value.original.type === reference.type) await consume(reference, result.value.original, signal, scope);
    else if (result.status === "failed") { if (!report(result)) setErrorMessage(result.code === ADMISSION_ERROR_CODE.resourceUnavailable ? COPY.absent : result.message); }
    else setErrorMessage(COPY.uncertain);
  }), [authorize, client, close, consume, initial, live, observeReference, pendingRef, report, run, setErrorMessage]);
  return { save, readOriginal };
}

/** @param workflow - Workflow state. @param core - Shared steps. @param run - Action runner. @returns The current read that rechecks the selection, and the next page. */
function useManagementReads(workflow: ManagementState, core: ManagementCore, run: ManagementRun) {
  const { initial, client, live, busyRef, closedRef, pendingRef, stateRef, draftRef, loadedPagesRef, setConfirmed, setSelectionBlocked, setConflict, setNeedsCurrent, setStatusMessage, setErrorMessage, setDraft, setReady, setMoreError, setLoadingMore, setState } = workflow;
  const { authorize, close, observeReference, refresh } = core;
  /** @param selected - The selected invitation's current version. @returns Whether it can no longer be replaced, which blocks the draft until it is discarded. */
  const blockUnavailableReplacement = useCallback((selected: PersonalInvitationManagementResult) => {
    if (!draftRef.current?.replaceSelected || selected.status === ADMISSION_INVITATION_STATUS.active) return false;
    draftRef.current = { ...draftRef.current, selected, replacementAcknowledged: false }; setDraft(draftRef.current); setSelectionBlocked(true); setConflict(true); setNeedsCurrent(true); setStatusMessage(null); setErrorMessage(PERSONAL_INVITATION_MANAGEMENT_REPLACEMENT_UNAVAILABLE);
    return true;
  }, [draftRef, setConflict, setDraft, setErrorMessage, setNeedsCurrent, setSelectionBlocked, setStatusMessage]);
  const readCurrent = useCallback((query = requireReadyValue(stateRef.current, CURRENT_STATE).query) => run(async (signal, scope) => {
    if (observeReference() || pendingRef.current) { setErrorMessage(COPY.uncertain); return; }
    setConfirmed(false); if (!await refresh(query, signal, scope)) return;
    const selectedId = draftRef.current?.selected?.id;
    const selected = selectedId ? requireReadyValue(stateRef.current, CURRENT_STATE).page.items.find((item) => item.id === selectedId) : null;
    if (selectedId && !selected) { setSelectionBlocked(true); setConflict(true); setNeedsCurrent(true); setStatusMessage(null); setErrorMessage(PERSONAL_INVITATION_MANAGEMENT_SELECTION_MISSING); return; }
    if (selected && blockUnavailableReplacement(selected)) return;
    if (draftRef.current && selected) { draftRef.current = { ...draftRef.current, selected, withdrawalAcknowledged: false, replacementAcknowledged: false }; setDraft(draftRef.current); }
    setSelectionBlocked(false); setConflict(false); setReady(true); toast.info(COPY.current);
  }), [blockUnavailableReplacement, draftRef, observeReference, pendingRef, refresh, run, setConfirmed, setConflict, setDraft, setErrorMessage, setNeedsCurrent, setReady, setSelectionBlocked, setStatusMessage, stateRef]);
  /** Adds the next page below the shown invitations without repeating any of them; the draft, its selection and the one-time link stay as they are. */
  const readMore = useCallback(async () => {
    const shown = stateRef.current, cursor = shown?.page.nextCursor;
    if (!initial || !shown || !cursor || busyRef.current || closedRef.current || pendingRef.current) return;
    setMoreError(null); setLoadingMore(true);
    try {
      await run(async (signal, scope) => {
        const result = await client.page(initial.slug, { ...shown.query, cursor }, signal);
        if (!live(signal, scope) || !await authorize(signal, scope)) return;
        if (result.status === "failed") { if (isAdmissionAccessLoss(result.code)) close(); else setMoreError(result.message); return; }
        if (result.status !== "ready") return;
        if (result.value.viewerId !== initial.viewerId || result.value.tribeId !== initial.tribeId) { close(); return; }
        const latest = stateRef.current ?? shown;
        stateRef.current = { ...result.value, query: latest.query, page: { items: appendAdmissionListPage(latest.page.items, result.value.page.items), nextCursor: result.value.page.nextCursor } };
        loadedPagesRef.current += 1; setState(stateRef.current);
      }, false, setMoreError);
    } finally { setLoadingMore(false); }
  }, [authorize, busyRef, client, close, closedRef, initial, live, loadedPagesRef, pendingRef, run, setLoadingMore, setMoreError, setState, stateRef]);
  return { readCurrent, readMore };
}

/** @param options - Guarded SSR snapshot and optional own ports. @returns Controlled actions with no automatic POST, restored consent or ordinary route refresh. */
export function usePersonalInvitationManagement(options: ManagementOptions) {
  const workflow = useManagementState(options);
  const core = useManagementCore(workflow);
  const { run, consume } = useManagementRunner(workflow, core);
  useManagementLifecycle(workflow, core, run);
  const { save, readOriginal } = useManagementWrites(workflow, core, { run, consume });
  const { readCurrent, readMore } = useManagementReads(workflow, core, run);
  const { state, draft, pending, ready, privateVisible, phase, confirmed, setConfirmed, loadingMore, moreError, errorMessage, setErrorMessage, fieldError, setFieldError, statusMessage, setStatusMessage, conflict, setConflict, needsCurrent, setNeedsCurrent, selectionBlocked, setSelectionBlocked, invitationUrl, setInvitationUrl, step, setStep, setDraft, busyRef, pendingRef, closedRef, mountedRef, draftRef, stateRef } = workflow;
  const changeDraft = (next: PersonalInvitationManagementDraft) => { if (busyRef.current || pendingRef.current || closedRef.current || !ready) return; draftRef.current = next; setDraft(next); setConfirmed(false); setFieldError(null); setErrorMessage(null); setStatusMessage(null); setInvitationUrl(null); };
  const select = (item: PersonalInvitationManagementResult, mode: "rename" | "revoke" | "create") => { if (!stateRef.current || conflict || busyRef.current || pendingRef.current || closedRef.current || !ready) return; const next = emptyPersonalInvitationManagementDraft(stateRef.current); changeDraft({ ...next, mode, selected: item, internalName: item.internalName, identity: item.recipient.value, country: item.recipient.country ?? next.country, requiresAllowlist: item.requiresAllowlist, replaceSelected: mode === MODE.create }); setStep(0); };
  /** Copies within the click itself: WebKit drops the user activation after a network round trip. The link is already on screen, focus changes recheck the viewer and copying never competes with the read that follows the write. */
  const copyUrl = async () => {
    if (!invitationUrl || closedRef.current) return;
    if (!navigator.clipboard?.writeText) { toast.info(COPY.clipboard); return; }
    try { await navigator.clipboard.writeText(invitationUrl); if (mountedRef.current && !closedRef.current) toast.success(COPY.copied); }
    catch { if (mountedRef.current) toast.info(COPY.clipboard); }
  };
  const discardSelection = () => { if (!selectionBlocked || !stateRef.current || busyRef.current || pendingRef.current || closedRef.current || !ready) return; changeDraft(emptyPersonalInvitationManagementDraft(stateRef.current)); setSelectionBlocked(false); setConflict(false); setNeedsCurrent(false); setStep(0); };
  return { state, draft, pending, ready, privateVisible, phase, confirmed, loadingMore, moreError, readMore, errorMessage, fieldError, statusMessage, conflict, needsCurrent, selectionBlocked, discardSelection, invitationUrl, step, setStep: (value: number) => { if (!busyRef.current) setStep(value); }, changeDraft, select, newInvitation: () => { if (stateRef.current && !conflict && !busyRef.current && !pendingRef.current) { changeDraft(emptyPersonalInvitationManagementDraft(stateRef.current)); setStep(0); } }, setConfirmed: (value: boolean) => { if (!ready || busyRef.current || pendingRef.current || closedRef.current) return; setConfirmed(value); setFieldError(null); }, save, readOriginal, readCurrent, copyUrl, hideUrl: () => setInvitationUrl(null) };
}
