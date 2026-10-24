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
import { personalInvitationMutationResultSchema, personalInvitationMutationDenialSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-management-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** @param options - Guarded SSR snapshot and optional own ports. @returns Controlled actions with no automatic POST, restored consent or ordinary route refresh. */
export function usePersonalInvitationManagement(options: { initialState: PersonalInvitationManagementPageState; client?: PersonalInvitationManagementBrowserClient }) {
  const initial = options.initialState.kind === "ready" ? options.initialState : null;
  const client = useMemo(() => options.client ?? createPersonalInvitationManagementApiClient({ origin: () => initial?.publicOrigin ?? "" }), [initial, options.client]);
  const [state, setState] = useState(initial), [draft, setDraft] = useState<PersonalInvitationManagementDraft | null>(() => initial ? emptyPersonalInvitationManagementDraft(initial) : null);
  const [confirmed, setConfirmed] = useState(false), [ready, setReady] = useState(false), [privateVisible, setPrivateVisible] = useState(true), [phase, setPhase] = useState<"checking" | "idle" | "reading" | "writing" | "uncertain" | "closed">(PHASE.checking);
  const [pending, setPending] = useState<PersonalInvitationManagementReference | null>(null), [errorMessage, setErrorMessage] = useState<string | null>(null), [fieldError, setFieldError] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null), [conflict, setConflict] = useState(false), [needsCurrent, setNeedsCurrent] = useState(false), [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const mounted = useRef(false), closed = useRef(false), generation = useRef(0), busy = useRef(false), controller = useRef<AbortController | null>(null), pendingRef = useRef<PersonalInvitationManagementReference | null>(null), draftRef = useRef(draft), stateRef = useRef(state);
  const [selectionBlocked, setSelectionBlocked] = useState(false), [step, setStep] = useState(0), writeToast = useRef<WriteToast | null>(null);
  const live = (signal: AbortSignal, scope: number) => mounted.current && generation.current === scope && !signal.aborted;

  /** A changed viewer permanently closes this mounted scope and removes transient private material. */
  const close = useCallback(() => { closed.current = true; setPrivateVisible(false); setReady(false); setConfirmed(false); setInvitationUrl(null); setPhase(PHASE.closed); setErrorMessage(COPY.account); }, []);
  /** @param signal - This observation's lifetime. @param scope - Mounted generation. @returns Whether the actual native viewer still owns this page. */
  const authorize = useCallback(async (signal: AbortSignal, scope: number) => {
    if (!initial || closed.current || !live(signal, scope)) return false;
    const viewer = await client.viewer(signal);
    if (!live(signal, scope) || viewer.status === "aborted") return false;
    if (viewer.status !== "ready" || viewer.value?.id !== initial.viewerId) { close(); return false; }
    return true;
  }, [client, close, initial]);
  /** @param reference - Original progress or confirmed absence. @returns Whether storage accepted the reference before dispatch. */
  const persist = useCallback((reference: PersonalInvitationManagementReference | null) => {
    if (!initial) return false;
    try { writePersonalInvitationManagementReference(initial.viewerId, initial.slug, reference); pendingRef.current = reference; setPending(reference); return true; }
    catch { setErrorMessage(COPY.storage); return false; }
  }, [initial]);
  /** Adopts original progress from another document without restoring a draft or consent. */
  const observeReference = useCallback(() => {
    if (!initial) return null;
    const reference = readPersonalInvitationManagementReference(initial.viewerId, initial.slug);
    if (reference) { pendingRef.current = reference; setPending(reference); setConfirmed(false); setInvitationUrl(null); }
    return reference;
  }, [initial]);
  /** @param failure - Safe own error. @returns Whether actual authority was lost, requiring a new document. */
  const report = useCallback((failure: { code: string; message: string }) => {
    if (failure.code === ADMISSION_ERROR_CODE.permissionDenied || failure.code === ADMISSION_ERROR_CODE.authenticationRequired) { close(); return true; }
    setErrorMessage(failure.message); return false;
  }, [close]);
  /** @param query - Own bounded filters. @param signal - Observation lifetime. @param scope - Mounted generation. @returns Whether fresh native page facts were published for this initial viewer. */
  const refresh = useCallback(async (query: PersonalInvitationManagementBrowserQuery, signal: AbortSignal, scope: number) => {
    const result = await client.page(initial!.slug, query, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return false;
    if (result.status !== "ready") { if (result.status === "failed") report(result); return false; }
    if (result.value.viewerId !== initial!.viewerId || result.value.tribeId !== initial!.tribeId) { close(); return false; }
    stateRef.current = result.value; setState(result.value); setNeedsCurrent(false); return true;
  }, [authorize, client, close, initial, report]);
  /** @param action - Explicit observation or write. @param writing - Whether the user confirmed a mutation. @returns After bounded cleanup; unresolved references survive timeout or cancellation. */
  const run = useCallback(async (action: (signal: AbortSignal, scope: number) => Promise<void>, writing = false) => {
    if (!initial || closed.current || busy.current) return;
    const next = new AbortController(), scope = generation.current; controller.current?.abort(); controller.current = next; busy.current = true;
    // A write's progress and outcome are its own toast; an unconfirmed original stays on screen.
    const timeout = window.setTimeout(() => next.abort(), PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS), notice = writing ? startWriteToast(COPY.saving) : null; writeToast.current = notice;
    /** A failure the leader can retry: the write's toast, or the page for a read or an unconfirmed original. */
    const fail = (message: string) => { if (notice && !pendingRef.current) notice.announce({ kind: "error", message }); else setErrorMessage(message); };
    setErrorMessage(null); setStatusMessage(null); setFieldError(null); setPhase(writing ? PHASE.writing : PHASE.reading);
    try { if (await authorize(next.signal, scope)) await action(next.signal, scope); }
    catch { if (live(next.signal, scope)) fail(pendingRef.current ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable); }
    finally {
      window.clearTimeout(timeout);
      if (controller.current === next) { controller.current = null; busy.current = false; if (mounted.current && generation.current === scope && !closed.current) { setPhase(pendingRef.current ? PHASE.uncertain : PHASE.idle); if (next.signal.aborted) fail(pendingRef.current ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable); } }
      if (writeToast.current === notice) writeToast.current = null;
      notice?.finish();
    }
  }, [authorize, initial]);

  /** Publishes the confirmed original before any following read, so a failed GET cannot reopen a write. */
  const consume = useCallback(async (reference: PersonalInvitationManagementReference, outcome: { state: "started" | "completed"; operationId: string; result?: unknown; invitationUrl?: string }, signal: AbortSignal, scope: number) => {
    if (outcome.operationId !== reference.operationId) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    if (outcome.state === OPERATION_STATE.started) { setErrorMessage(COPY.started); return; }
    const denial = personalInvitationMutationDenialSchema.safeParse(outcome.result), success = personalInvitationMutationResultSchema.safeParse(outcome.result);
    if (!denial.success && (!success.success || reference.invitationId !== null && (success.data.invitationId !== reference.invitationId || success.data.created || success.data.version !== reference.expectedVersion! + (success.data.changed ? 1 : 0)))) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    pendingRef.current = null; setPending(null); setConfirmed(false); setNeedsCurrent(true);
    const stored = persist(null);
    if (denial.success) {
      const blocking = denial.data.code === ADMISSION_ERROR_CODE.invitationConflict;
      setConflict(blocking); if (stored) setNeedsCurrent(false);
      // A conflict blocks the form and stays next to it; any other denial is the write's failure.
      if (blocking || !writeToast.current) setErrorMessage(ADMISSION_ERROR_MESSAGE[denial.data.code]); else writeToast.current.announce({ kind: "error", message: ADMISSION_ERROR_MESSAGE[denial.data.code] });
      return;
    }
    setInvitationUrl(outcome.invitationUrl ?? null); setStep(0);
    // A lost one-time link stays on screen: the leader has to act on it.
    if (reference.type === REAUTHENTICATION_OPERATION.createPersonalInvitation && !outcome.invitationUrl) setStatusMessage(COPY.lostUrl);
    if (writeToast.current) writeToast.current.announce({ kind: "success", message: COPY.saved }); else toast.success(COPY.recovered);
    if (!stored) return;
    if (!await refresh(stateRef.current!.query, signal, scope) && live(signal, scope) && !closed.current) { setErrorMessage(COPY.freshFailed); return; }
    const currentState = stateRef.current!; draftRef.current = emptyPersonalInvitationManagementDraft(currentState); setDraft(draftRef.current); setConflict(false);
  }, [persist, refresh]);

  useEffect(() => {
    mounted.current = true; generation.current += 1; const scope = generation.current, hydration = new AbortController();
    const timeout = window.setTimeout(() => hydration.abort(), PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS);
    queueMicrotask(() => { void (async () => {
      if (!await authorize(hydration.signal, scope)) return;
      observeReference(); if (!live(hydration.signal, scope)) return; setReady(true); setConfirmed(false); setPhase(pendingRef.current ? PHASE.uncertain : PHASE.idle);
    })().catch(() => { if (live(hydration.signal, scope)) { setErrorMessage(COPY.storage); setPhase(PHASE.idle); } }).finally(() => { window.clearTimeout(timeout); if (hydration.signal.aborted && mounted.current && generation.current === scope) { setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(PHASE.idle); } }); });
    /** Restoring a document rereads identity/progress and never restarts its original mutation. */
    const restored = (event: PageTransitionEvent) => { if (!event.persisted || !mounted.current || closed.current || busy.current) return; setPrivateVisible(false); setConfirmed(false); setInvitationUrl(null); void run(async (signal, observedScope) => { observeReference(); if (await refresh(stateRef.current!.query, signal, observedScope) && !closed.current) setPrivateVisible(true); }); };
    /**
     * Returning to the window rechecks the account and the tribe authority behind the page read: losing either closes the private view.
     * The one-time link, its feedback and the draft stay for an unchanged authorized leader, and a transient read failure stays silent.
     */
    const regainedFocus = () => {
      if (!mounted.current || closed.current || busy.current || !stateRef.current) return;
      const check = new AbortController(), checkScope = generation.current, checkTimeout = window.setTimeout(() => check.abort(), PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS);
      void (async () => {
        if (!await authorize(check.signal, checkScope)) return;
        const result = await client.page(initial!.slug, stateRef.current!.query, check.signal);
        if (!live(check.signal, checkScope) || closed.current || busy.current) return;
        if (result.status === "failed") { if (result.code === ADMISSION_ERROR_CODE.permissionDenied || result.code === ADMISSION_ERROR_CODE.authenticationRequired) close(); return; }
        if (result.status !== "ready") return;
        if (result.value.viewerId !== initial!.viewerId || result.value.tribeId !== initial!.tribeId) { close(); return; }
        stateRef.current = result.value; setState(result.value); observeReference();
      })().catch(() => undefined).finally(() => window.clearTimeout(checkTimeout));
    };
    window.addEventListener("pageshow", restored);
    window.addEventListener("focus", regainedFocus);
    return () => { mounted.current = false; generation.current += 1; hydration.abort(); controller.current?.abort(); window.clearTimeout(timeout); window.removeEventListener("pageshow", restored); window.removeEventListener("focus", regainedFocus); busy.current = false; };
  }, [authorize, client, close, initial, observeReference, refresh, run]);

  const save = useCallback(async () => {
    if (!ready || !confirmed || busy.current || closed.current || pendingRef.current || needsCurrent || conflict || !stateRef.current || !draftRef.current) { if (!confirmed) setFieldError(COPY.confirm); return; }
    let intent;
    try { intent = preparePersonalInvitationManagementIntent(stateRef.current, draftRef.current, newAdmissionOperationId(), new Date()); }
    catch { setFieldError(COPY.invalid); return; }
    await run(async (signal, scope) => {
      if (observeReference()) { setErrorMessage(COPY.uncertain); return; }
      const reference: PersonalInvitationManagementReference = { type: intent.type, operationId: intent.input.operationId, invitationId: intent.type === REAUTHENTICATION_OPERATION.createPersonalInvitation ? null : intent.invitationId, expectedVersion: intent.type === REAUTHENTICATION_OPERATION.createPersonalInvitation ? null : intent.input.expectedVersion };
      if (!persist(reference)) return;
      const result = await client.write(initial!.slug, intent, signal);
      if (!live(signal, scope) || !await authorize(signal, scope)) return;
      if (result.status === "ready") { if (result.value.viewerId !== initial!.viewerId) { close(); return; } await consume(reference, result.value.outcome, signal, scope); }
      else if (result.status === "failed" && !result.uncertain) {
        pendingRef.current = null; setPending(null); if (!persist(null)) { setNeedsCurrent(true); return; } setConfirmed(false); if (report(result)) return;
        const blocking = result.code === ADMISSION_ERROR_CODE.invitationConflict; setConflict(blocking);
        if (!blocking) { setErrorMessage(null); writeToast.current?.announce({ kind: "error", message: result.message }); }
      }
      else setErrorMessage(COPY.uncertain);
    }, true);
  }, [authorize, client, close, confirmed, conflict, consume, initial, needsCurrent, observeReference, persist, ready, report, run]);
  const readOriginal = useCallback(() => run(async (signal, scope) => {
    observeReference(); const reference = pendingRef.current; if (!reference) return;
    const result = await client.operation(initial!.slug, reference.operationId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready" && result.value.viewerId !== initial!.viewerId) { close(); return; }
    if (result.status === "ready" && result.value.original.type === reference.type) await consume(reference, result.value.original, signal, scope);
    else if (result.status === "failed") { if (!report(result)) setErrorMessage(result.code === ADMISSION_ERROR_CODE.resourceUnavailable ? COPY.absent : result.message); }
    else setErrorMessage(COPY.uncertain);
  }), [authorize, client, close, consume, initial, observeReference, report, run]);
  const readCurrent = useCallback((query = stateRef.current!.query) => run(async (signal, scope) => {
    if (observeReference() || pendingRef.current) { setErrorMessage(COPY.uncertain); return; }
    setConfirmed(false); if (!await refresh(query, signal, scope)) return;
    const selectedId = draftRef.current?.selected?.id;
    const selected = selectedId ? stateRef.current!.page.items.find((item) => item.id === selectedId) : null;
    if (selectedId && !selected) { setSelectionBlocked(true); setConflict(true); setNeedsCurrent(true); setStatusMessage(null); setErrorMessage(PERSONAL_INVITATION_MANAGEMENT_SELECTION_MISSING); return; }
    if (selected && draftRef.current?.replaceSelected && selected.status !== ADMISSION_INVITATION_STATUS.active) { draftRef.current = { ...draftRef.current, selected, replacementAcknowledged: false }; setDraft(draftRef.current); setSelectionBlocked(true); setConflict(true); setNeedsCurrent(true); setStatusMessage(null); setErrorMessage(PERSONAL_INVITATION_MANAGEMENT_REPLACEMENT_UNAVAILABLE); return; }
    if (draftRef.current && selected) { draftRef.current = { ...draftRef.current, selected, withdrawalAcknowledged: false, replacementAcknowledged: false }; setDraft(draftRef.current); }
    setSelectionBlocked(false); setConflict(false); setReady(true); toast.info(COPY.current);
  }), [observeReference, refresh, run]);
  const changeDraft = (next: PersonalInvitationManagementDraft) => { if (busy.current || pendingRef.current || closed.current || !ready) return; draftRef.current = next; setDraft(next); setConfirmed(false); setFieldError(null); setErrorMessage(null); setStatusMessage(null); setInvitationUrl(null); };
  const select = (item: PersonalInvitationManagementResult, mode: "rename" | "revoke" | "create") => { if (!stateRef.current || conflict || busy.current || pendingRef.current || closed.current || !ready) return; const next = emptyPersonalInvitationManagementDraft(stateRef.current); changeDraft({ ...next, mode, selected: item, internalName: item.internalName, identity: item.recipient.value, country: item.recipient.country ?? next.country, requiresAllowlist: item.requiresAllowlist, replaceSelected: mode === MODE.create }); setStep(0); };
  /** Copies within the click itself: WebKit drops the user activation after a network round trip. The link is already on screen, focus changes recheck the viewer and copying never competes with the read that follows the write. */
  const copyUrl = async () => {
    if (!invitationUrl || closed.current) return;
    if (!navigator.clipboard?.writeText) { toast.info(COPY.clipboard); return; }
    try { await navigator.clipboard.writeText(invitationUrl); if (mounted.current && !closed.current) toast.success(COPY.copied); }
    catch { if (mounted.current) toast.info(COPY.clipboard); }
  };
  const discardSelection = () => { if (!selectionBlocked || !stateRef.current || busy.current || pendingRef.current || closed.current || !ready) return; changeDraft(emptyPersonalInvitationManagementDraft(stateRef.current)); setSelectionBlocked(false); setConflict(false); setNeedsCurrent(false); setStep(0); };
  return { state, draft, pending, ready, privateVisible, phase, confirmed, errorMessage, fieldError, statusMessage, conflict, needsCurrent, selectionBlocked, discardSelection, invitationUrl, step, setStep: (value: number) => { if (!busy.current) setStep(value); }, changeDraft, select, newInvitation: () => { if (stateRef.current && !conflict && !busy.current && !pendingRef.current) { changeDraft(emptyPersonalInvitationManagementDraft(stateRef.current)); setStep(0); } }, setConfirmed: (value: boolean) => { if (!ready || busy.current || pendingRef.current || closed.current) return; setConfirmed(value); setFieldError(null); }, save, readOriginal, readCurrent, copyUrl, hideUrl: () => setInvitationUrl(null) };
}
