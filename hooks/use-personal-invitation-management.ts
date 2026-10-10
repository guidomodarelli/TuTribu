"use client";
/** Owns viewer-scoped administrative proposals, one-view material and read-only original recovery. @module use-personal-invitation-management */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "beez-ui";
import type { PersonalInvitationManagementPageState, PersonalInvitationManagementBrowserQuery } from "@/src/modules/academy-admissions/application/results/personal-invitation-management-page-state";
import type { PersonalInvitationManagementBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import type { PersonalInvitationManagementDraft, PersonalInvitationManagementReference } from "@/src/modules/academy-admissions/application/commands/personal-invitation-management-intent";
import type { PersonalInvitationManagementResult } from "@/src/modules/academy-admissions/application/results/admission-resource-result";
import type { ReauthenticationIntentBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import { emptyPersonalInvitationManagementDraft, preparePersonalInvitationManagementIntent } from "@/src/modules/academy-admissions/application/commands/prepare-personal-invitation-management-intent";
import { createPersonalInvitationManagementApiClient } from "@/lib/academy-admissions/personal-invitation-management-api-client";
import { personalInvitationManagementReauthenticationClient } from "@/lib/academy-admissions/personal-invitation-management-reauthentication-client";
import { readPersonalInvitationManagementReference, writePersonalInvitationManagementReference } from "@/lib/academy-admissions/personal-invitation-management-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { PERSONAL_INVITATION_MANAGEMENT_COPY as COPY, PERSONAL_INVITATION_MANAGEMENT_PHASE as PHASE, PERSONAL_INVITATION_MANAGEMENT_MODE as MODE, PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS, PERSONAL_INVITATION_MANAGEMENT_SELECTION_MISSING, PERSONAL_INVITATION_MANAGEMENT_REPLACEMENT_UNAVAILABLE } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";
import { ADMISSION_INVITATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { PERSONAL_INVITATION_MANAGEMENT_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/personal-invitation-management-page";
import { personalInvitationMutationResultSchema, personalInvitationMutationDenialSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-management-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** @param options - Guarded SSR snapshot and optional own ports. @returns Controlled actions with no automatic POST, restored consent or ordinary route refresh. */
export function usePersonalInvitationManagement(options: { initialState: PersonalInvitationManagementPageState; client?: PersonalInvitationManagementBrowserClient; reauthentication?: ReauthenticationIntentBrowserClient }) {
  const initial = options.initialState.kind === "ready" ? options.initialState : null;
  const client = useMemo(() => options.client ?? createPersonalInvitationManagementApiClient({ origin: () => initial?.publicOrigin ?? "" }), [initial, options.client]), reauthentication = options.reauthentication ?? personalInvitationManagementReauthenticationClient;
  const [state, setState] = useState(initial), [draft, setDraft] = useState<PersonalInvitationManagementDraft | null>(() => initial ? emptyPersonalInvitationManagementDraft(initial) : null);
  const [confirmed, setConfirmed] = useState(false), [ready, setReady] = useState(false), [privateVisible, setPrivateVisible] = useState(true), [phase, setPhase] = useState<"checking" | "idle" | "reading" | "writing" | "uncertain" | "closed">(PHASE.checking);
  const [pending, setPending] = useState<PersonalInvitationManagementReference | null>(null), [errorMessage, setErrorMessage] = useState<string | null>(null), [fieldError, setFieldError] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null), [conflict, setConflict] = useState(false), [needsCurrent, setNeedsCurrent] = useState(false), [reauthenticationRequired, setReauthenticationRequired] = useState(false), [recoveryHref, setRecoveryHref] = useState<string | null>(null), [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const mounted = useRef(false), closed = useRef(false), generation = useRef(0), busy = useRef(false), controller = useRef<AbortController | null>(null), pendingRef = useRef<PersonalInvitationManagementReference | null>(null), draftRef = useRef(draft), stateRef = useRef(state);
  const [selectionBlocked, setSelectionBlocked] = useState(false);
  const live = (signal: AbortSignal, scope: number) => mounted.current && generation.current === scope && !signal.aborted;

  /** A changed viewer permanently closes this mounted scope and removes transient private material. */
  const close = useCallback(() => { closed.current = true; setPrivateVisible(false); setReady(false); setConfirmed(false); setInvitationUrl(null); setRecoveryHref(null); setPhase(PHASE.closed); setErrorMessage(COPY.account); }, []);
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
    const timeout = window.setTimeout(() => next.abort(), PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS), notice = writing ? toast.loading(COPY.saving) : null;
    setErrorMessage(null); setStatusMessage(null); setFieldError(null); setPhase(writing ? PHASE.writing : PHASE.reading);
    try { if (await authorize(next.signal, scope)) await action(next.signal, scope); }
    catch { if (live(next.signal, scope)) setErrorMessage(pendingRef.current ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable); }
    finally {
      window.clearTimeout(timeout); if (notice !== null) toast.dismiss(notice);
      if (controller.current === next) { controller.current = null; busy.current = false; if (mounted.current && generation.current === scope && !closed.current) { setPhase(pendingRef.current ? PHASE.uncertain : PHASE.idle); if (next.signal.aborted) setErrorMessage(pendingRef.current ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable); } }
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
    if (denial.success) { setConflict(denial.data.code === ADMISSION_ERROR_CODE.invitationConflict); setErrorMessage(ADMISSION_ERROR_MESSAGE[denial.data.code]); if (stored) setNeedsCurrent(false); return; }
    setInvitationUrl(outcome.invitationUrl ?? null); setStatusMessage(reference.type === REAUTHENTICATION_OPERATION.createPersonalInvitation && !outcome.invitationUrl ? COPY.lostUrl : COPY.saved); toast.success(COPY.saved);
    if (!stored) return;
    if (!await refresh(stateRef.current!.query, signal, scope) && live(signal, scope) && !closed.current) { setErrorMessage(COPY.freshFailed); return; }
    const currentState = stateRef.current!; draftRef.current = emptyPersonalInvitationManagementDraft(currentState); setDraft(draftRef.current); setConflict(false); setReauthenticationRequired(false); setRecoveryHref(null);
  }, [persist, refresh]);

  useEffect(() => {
    mounted.current = true; generation.current += 1; const scope = generation.current, hydration = new AbortController();
    const timeout = window.setTimeout(() => hydration.abort(), PERSONAL_INVITATION_MANAGEMENT_TIMEOUT_MS);
    queueMicrotask(() => { void (async () => {
      if (!await authorize(hydration.signal, scope)) return;
      observeReference(); if (!live(hydration.signal, scope)) return; setReady(true); setConfirmed(false); setPhase(pendingRef.current ? PHASE.uncertain : PHASE.idle);
    })().catch(() => { if (live(hydration.signal, scope)) { setErrorMessage(COPY.storage); setPhase(PHASE.idle); } }).finally(() => { window.clearTimeout(timeout); if (hydration.signal.aborted && mounted.current && generation.current === scope) { setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(PHASE.idle); } }); });
    /** Restoring a document rereads identity/progress and never restarts its original mutation. */
    const restored = () => { if (!mounted.current || closed.current || busy.current) return; setPrivateVisible(false); setConfirmed(false); setInvitationUrl(null); void run(async (signal, observedScope) => { observeReference(); if (await refresh(stateRef.current!.query, signal, observedScope) && !closed.current) setPrivateVisible(true); }); };
    window.addEventListener("pageshow", restored);
    window.addEventListener("focus", restored);
    return () => { mounted.current = false; generation.current += 1; hydration.abort(); controller.current?.abort(); window.clearTimeout(timeout); window.removeEventListener("pageshow", restored); window.removeEventListener("focus", restored); busy.current = false; };
  }, [authorize, observeReference, refresh, run]);

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
      else if (result.status === "failed" && !result.uncertain) { pendingRef.current = null; setPending(null); if (!persist(null)) { setNeedsCurrent(true); return; } setConfirmed(false); if (report(result)) return; setConflict(result.code === ADMISSION_ERROR_CODE.invitationConflict); setReauthenticationRequired(result.code === ADMISSION_ERROR_CODE.reauthenticationRequired); }
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
    setSelectionBlocked(false); setConflict(false); setReady(true); setStatusMessage(COPY.current);
  }), [observeReference, refresh, run]);
  const reauthenticate = useCallback(() => run(async (signal, scope) => {
    const proposal = draftRef.current; if (!initial || !proposal || !reauthenticationRequired || pendingRef.current) return;
    const operation = proposal.mode === MODE.rename ? REAUTHENTICATION_OPERATION.renamePersonalInvitation : proposal.mode === MODE.revoke ? REAUTHENTICATION_OPERATION.revokePersonalInvitation : REAUTHENTICATION_OPERATION.createPersonalInvitation;
    const result = await reauthentication.create({ tribeId: initial.tribeId, resourceId: operation === REAUTHENTICATION_OPERATION.createPersonalInvitation ? initial.tribeId : proposal.selected!.id, operation, returnPath: `/${encodeURIComponent(initial.slug)}/${PERSONAL_INVITATION_MANAGEMENT_SETTINGS_SEGMENT}`, confirmed: true }, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") { setRecoveryHref(result.href); setStatusMessage(COPY.authentication); } else if (result.status === "failed") setErrorMessage(COPY.authenticationFailed);
  }), [authorize, initial, reauthentication, reauthenticationRequired, run]);
  const changeDraft = (next: PersonalInvitationManagementDraft) => { if (busy.current || pendingRef.current || closed.current || !ready) return; draftRef.current = next; setDraft(next); setConfirmed(false); setFieldError(null); setErrorMessage(null); setStatusMessage(null); setRecoveryHref(null); setReauthenticationRequired(false); setInvitationUrl(null); };
  const select = (item: PersonalInvitationManagementResult, mode: "rename" | "revoke" | "create") => { if (!stateRef.current || conflict) return; const next = emptyPersonalInvitationManagementDraft(stateRef.current); changeDraft({ ...next, mode, selected: item, internalName: item.internalName, identity: item.recipient.value, country: item.recipient.country ?? next.country, requiresAllowlist: item.requiresAllowlist, replaceSelected: mode === MODE.create }); };
  const copyUrl = () => run(async (signal, scope) => {
    if (!invitationUrl || !await refresh(stateRef.current!.query, signal, scope) || closed.current) return;
    if (!navigator.clipboard?.writeText) { setStatusMessage(COPY.clipboard); return; }
    try { await navigator.clipboard.writeText(invitationUrl); if (live(signal, scope)) setStatusMessage(COPY.copied); }
    catch { if (live(signal, scope)) setStatusMessage(COPY.clipboard); }
  });
  const discardSelection = () => { if (!selectionBlocked || !stateRef.current || busy.current || pendingRef.current || closed.current || !ready) return; changeDraft(emptyPersonalInvitationManagementDraft(stateRef.current)); setSelectionBlocked(false); setConflict(false); setNeedsCurrent(false); };
  return { state, draft, pending, ready, privateVisible, phase, confirmed, errorMessage, fieldError, statusMessage, conflict, needsCurrent, selectionBlocked, discardSelection, invitationUrl, reauthenticationRequired, recoveryHref, changeDraft, select, newInvitation: () => { if (stateRef.current && !conflict) changeDraft(emptyPersonalInvitationManagementDraft(stateRef.current)); }, setConfirmed: (value: boolean) => { if (!ready || busy.current || pendingRef.current || closed.current) return; setConfirmed(value); setFieldError(null); }, save, readOriginal, readCurrent, reauthenticate, copyUrl, hideUrl: () => setInvitationUrl(null) };
}
