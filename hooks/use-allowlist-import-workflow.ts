"use client";
/** Owns one viewer-scoped CSV draft, explicit writes and read-only original/current recovery. @module use-allowlist-import-workflow */
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { toast } from "@golfo/ui";
import { startWriteToast, type WriteToast } from "@/lib/toasts/write-toast";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { AllowlistBrowserResult } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { AllowlistImportDraftStore } from "@/src/modules/academy-admissions/application/ports/allowlist-import-draft-store";
import type { AllowlistImportBrowserIntent, AllowlistImportDraft } from "@/src/modules/academy-admissions/application/commands/allowlist-import-browser-intent";
import { allowlistImportSchema, type AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";
import { allowlistImportDenialSchema } from "@/src/modules/academy-admissions/application/results/allowlist-import-operation-schemas";
import { allowlistImportApiClient } from "@/lib/academy-admissions/allowlist-import-api-client";
import { readAllowlistImport, writeAllowlistImport, type StoredAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";
import { readAllowlistImportFile, countAllowlistImportRows, downloadAllowlistImportFile  } from "@/lib/academy-admissions/allowlist-import-file-client";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { ALLOWLIST_IMPORT_BROWSER_COPY as COPY, ALLOWLIST_IMPORT_WRITE_ACTION as WRITE_ACTION, ALLOWLIST_IMPORT_STEP, type AllowlistImportWriteAction } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { ALLOWLIST_BROWSER_TIMEOUT_MS } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { ADMISSION_IMPORT_PUBLIC_STATE as IMPORT_STATE } from "@/src/modules/academy-admissions/constants/admission-management-contract";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION as OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { allowlistImportDraftStore } from "@/lib/academy-admissions/allowlist-import-draft-store";
import { isSelectableAllowlistImportRow, listSelectableAllowlistImportRows } from "@/lib/academy-admissions/allowlist-import-selection";
import { closeAllowlistImportScope, interruptedActionMessage, isBlockingImportFailure, readUsableWriteResult, releaseAllowlistImportRun, requireReadyScope } from "@/hooks/use-allowlist-import-workflow-support";

type AllowlistImportWorkflowOptions = { initialState: AllowlistImportPageState; client?: AllowlistImportBrowserClient; drafts?: AllowlistImportDraftStore };
type OriginalValue = { operationId: string; state: "started" | "completed"; result?: unknown };
type ImportDenialCode = z.infer<typeof allowlistImportDenialSchema>["code"];
type ConsumeInput = { intent: AllowlistImportBrowserIntent; value: OriginalValue; signal: AbortSignal; scope: number; originalRead?: boolean };

/** @param options - Safe current SSR scope and explicit browser collaborators. @returns Every state, ref and setter of the workflow. */
function useAllowlistImportState(options: AllowlistImportWorkflowOptions) {
  const initial = options.initialState.kind === "ready" ? options.initialState : null, client = options.client ?? allowlistImportApiClient, drafts = options.drafts ?? allowlistImportDraftStore;
  const empty = (): StoredAllowlistImport => ({ viewerId: initial?.viewerId ?? "", slug: initial?.slug ?? "", draft: null, importId: null, selection: [], pending: null, unresolved: [] });
  const [stored, setStored] = useState<StoredAllowlistImport>(empty), currentRef = useRef(stored);
  /** Rendered twin of `authorityLost`: once the account or the authority is gone, the page offers its way back. */
  const [accessLost, setAccessLost] = useState(false);
  const [snapshot, setSnapshot] = useState<AllowlistImportDto | null>(null), snapshotRef = useRef<AllowlistImportDto | null>(null);
  const [policy, setPolicy] = useState({ contactType: initial?.contactType ?? null, version: initial?.policyVersion ?? null });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [privateVisible, setPrivateVisible] = useState(true);
  /** `busy` covers reads and writes; this names only the server write in flight, so its control alone shows progress. */
  const [writeAction, setWriteAction] = useState<AllowlistImportWriteAction | null>(null);
  const [initializationFailed, setInitializationFailed] = useState(false), [initializationRevision, setInitializationRevision] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [fieldError, setFieldError] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false), [policyConflict, setPolicyConflict] = useState(false), [originalChecked, setOriginalChecked] = useState(false), [step, setStep] = useState<number>(ALLOWLIST_IMPORT_STEP.upload);
  const activeRef = useRef(false), generationRef = useRef(0), occupiedRef = useRef(false), authorityLostRef = useRef(false), controllerRef = useRef<AbortController | null>(null), downloadCleanupRef = useRef(new Set<() => void>()), writeToastRef = useRef<WriteToast | null>(null);
  const live = useCallback((signal: AbortSignal, scope: number) => activeRef.current && generationRef.current === scope && !signal.aborted, []);
  return { initial, client, drafts, stored, setStored, currentRef, accessLost, setAccessLost, snapshot, setSnapshot, snapshotRef, policy, setPolicy, ready, setReady, busy, setBusy, confirmed, setConfirmed, privateVisible, setPrivateVisible, writeAction, setWriteAction, initializationFailed, setInitializationFailed, initializationRevision, setInitializationRevision, errorMessage, setErrorMessage, fieldError, setFieldError, statusMessage, setStatusMessage, conflict, setConflict, policyConflict, setPolicyConflict, originalChecked, setOriginalChecked, step, setStep, activeRef, generationRef, occupiedRef, authorityLostRef, controllerRef, downloadCleanupRef, writeToastRef, live };
}
type AllowlistImportState = ReturnType<typeof useAllowlistImportState>;

/** @param state - Workflow state. @returns Durable record writes, failure reporting, identity checks and current reads. */
function useAllowlistImportReads(state: AllowlistImportState) {
  const { initial, client, currentRef, setStored, setErrorMessage, setReady, setInitializationFailed, authorityLostRef, setAccessLost, setPrivateVisible, setConfirmed, writeToastRef, live, snapshotRef, setSnapshot, setConflict } = state;
  /** @param next - One exact owned proposal and references. @returns True only when a new write can recover its identity after navigation. */
  const persist = useCallback((next: StoredAllowlistImport) => {
    try { writeAllowlistImport(next); currentRef.current = next; setStored(next); return true; }
    catch { setErrorMessage(COPY.storage); setReady(false); setInitializationFailed(true); return false; }
  }, [currentRef, setErrorMessage, setInitializationFailed, setReady, setStored]);
  /** @param failure - Safe own feedback. @returns True when every private field must be hidden. */
  const reportFailure = useCallback((failure: Extract<AllowlistBrowserResult<unknown>, { status: "failed" }>) => {
    setErrorMessage(failure.message);
    const denied = failure.code === ADMISSION_ERROR_CODE.authenticationRequired || failure.code === ADMISSION_ERROR_CODE.permissionDenied;
    if (denied) { authorityLostRef.current = true; setAccessLost(true); setPrivateVisible(false); setReady(false); setConfirmed(false); }
    return denied;
  }, [authorityLostRef, setAccessLost, setConfirmed, setErrorMessage, setPrivateVisible, setReady]);
  /** @param message - Safe failure copy. @param blocking - Whether it keeps the flow blocked; that stays on screen, any other failure is the write's toast. */
  const announceFailure = useCallback((message: string, blocking: boolean) => {
    if (blocking || !writeToastRef.current) { setErrorMessage(message); return; }
    setErrorMessage(null); writeToastRef.current.announce({ kind: "error", message });
  }, [setErrorMessage, writeToastRef]);
  /** @param signal - Current cancellable action. @param scope - Render generation. @returns Current native identity; stale data can never replace a new account's view. */
  const authorize = useCallback(async (signal: AbortSignal, scope: number) => {
    if (!initial || !live(signal, scope)) return false;
    const viewer = await client.viewer(signal);
    if (!live(signal, scope)) return false;
    if (viewer.status === "aborted") return false;
    if (viewer.status !== "ready" || viewer.value?.id !== initial.viewerId) { authorityLostRef.current = true; setAccessLost(true); setPrivateVisible(false); setReady(false); setConfirmed(false); setErrorMessage(COPY.account); return false; }
    return true;
  }, [authorityLostRef, client, initial, live, setAccessLost, setConfirmed, setErrorMessage, setPrivateVisible, setReady]);
  /** Drops the saved resource the server no longer has, unless an original still needs it. */
  const forgetUnavailableImport = useCallback(() => {
    snapshotRef.current = null; setSnapshot(null);
    if (!currentRef.current.pending && !currentRef.current.unresolved.length) persist({ ...currentRef.current, importId: null, selection: [] });
  }, [currentRef, persist, setSnapshot, snapshotRef]);
  /** @param importId - Exact owned saved resource. @param signal - Action scope. @param scope - Render generation. @returns Current DTO only; failures preserve prior confirmed progress. */
  const fetchCurrent = useCallback(async (importId: string, signal: AbortSignal, scope: number) => {
    const result = await client.read(requireReadyScope(initial).slug, importId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return false;
    if (result.status !== "ready") {
      if (result.status === "failed") { if (result.code === ADMISSION_ERROR_CODE.resourceUnavailable) forgetUnavailableImport(); reportFailure(result); }
      return false;
    }
    const parsed = allowlistImportSchema.safeParse(result.value);
    if (!parsed.success || parsed.data.importId !== importId || snapshotRef.current?.importId === importId && parsed.data.sourceVersion < snapshotRef.current.sourceVersion) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return false; }
    const eligible = new Set(listSelectableAllowlistImportRows(parsed.data.rows));
    const selection = currentRef.current.selection.filter((number) => eligible.has(number));
    if (selection.length !== currentRef.current.selection.length && !persist({ ...currentRef.current, selection })) return false;
    snapshotRef.current = parsed.data; setSnapshot(parsed.data); setConflict(false); setConfirmed(false);
    return true;
  }, [authorize, client, currentRef, forgetUnavailableImport, initial, live, persist, reportFailure, setConfirmed, setConflict, setErrorMessage, setSnapshot, snapshotRef]);
  return { persist, reportFailure, announceFailure, authorize, fetchCurrent };
}
type AllowlistImportReads = ReturnType<typeof useAllowlistImportReads>;

/** @param state - Workflow state. @param reads - Record and read steps. @returns The bounded action runner and the original consumers. */
function useAllowlistImportWrites(state: AllowlistImportState, reads: AllowlistImportReads) {
  const { initial, client, currentRef, occupiedRef, authorityLostRef, controllerRef, activeRef, generationRef, writeToastRef, live, setBusy, setWriteAction, setErrorMessage, setFieldError, setStatusMessage, setOriginalChecked, setStep, setConfirmed, setConflict, setPolicyConflict } = state;
  const { persist, reportFailure, announceFailure, authorize, fetchCurrent } = reads;
  /** @param action - One user operation. @param message - Own progress copy. @param write - The pressed write when an original is being dispatched. @returns After bounded action cleanup; cancellation never implies rollback. */
  const run = useCallback(async (action: (signal: AbortSignal, scope: number) => Promise<void>, message: string = COPY.reading, write: AllowlistImportWriteAction | null = null) => {
    if (!initial || occupiedRef.current || authorityLostRef.current) return;
    occupiedRef.current = true; setBusy(true); setWriteAction(write); setErrorMessage(null); setFieldError(null); setStatusMessage(write ? null : message);
    const next = new AbortController(), scope = generationRef.current; controllerRef.current = next;
    // A server write announces its progress and outcome in its own toast; an unconfirmed original stays on screen.
    const timeout = window.setTimeout(() => next.abort(), ALLOWLIST_BROWSER_TIMEOUT_MS), notice = write ? startWriteToast(message) : null; writeToastRef.current = notice;
    /** A failure the leader can retry: the write's toast, or the page for a read. */
    const fail = (failure: string) => { if (notice && !currentRef.current.pending) notice.announce({ kind: "error", message: failure }); else setErrorMessage(failure); };
    try { if (await authorize(next.signal, scope)) await action(next.signal, scope); }
    catch { if (live(next.signal, scope)) fail(interruptedActionMessage(currentRef.current)); }
    finally {
      window.clearTimeout(timeout);
      releaseAllowlistImportRun({ controllerRef, occupiedRef, activeRef, generationRef, writeToastRef, setBusy, setWriteAction, setStatusMessage }, { next, scope, message, notice, fail, currentRef });
    }
  }, [activeRef, authorityLostRef, authorize, controllerRef, currentRef, generationRef, initial, live, occupiedRef, setBusy, setErrorMessage, setFieldError, setStatusMessage, setWriteAction, writeToastRef]);
  /** @param intent - Immutable original proposal. @param code - Denial the original recorded. @returns After clearing the original and showing why it was denied. */
  const consumeDenial = useCallback((intent: AllowlistImportBrowserIntent, code: ImportDenialCode) => {
    if (!persist({ ...currentRef.current, pending: null, unresolved: currentRef.current.unresolved.filter((original) => original.operationId !== intent.operationId) })) return;
    setConfirmed(false); setConflict(code === ADMISSION_ERROR_CODE.allowlistImportConflict); setPolicyConflict(code === ADMISSION_ERROR_CODE.policyConflict);
    announceFailure(ADMISSION_ERROR_MESSAGE[code], isBlockingImportFailure(code));
  }, [announceFailure, currentRef, persist, setConfirmed, setConflict, setPolicyConflict]);
  /** @param intent - Immutable original proposal. @param result - Completed original result. @param signal - Action scope. @param scope - Render generation. @returns After original/current reconciliation, without overwriting rows from historical counts. */
  const consumeCompleted = useCallback(async (intent: AllowlistImportBrowserIntent, result: unknown, signal: AbortSignal, scope: number) => {
    const data = readUsableWriteResult(intent, result);
    if (!data) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    if (!persist({ ...currentRef.current, importId: data.importId, pending: null, unresolved: currentRef.current.unresolved.filter((original) => original.operationId !== intent.operationId) })) return;
    setConfirmed(false); setOriginalChecked(false);
    if (!await fetchCurrent(data.importId, signal, scope)) {
      if (live(signal, scope) && !authorityLostRef.current) { setConflict(true); setStatusMessage(currentRef.current.importId ? COPY.currentReadFailed : COPY.historical); }
      return;
    }
    setConfirmed(false); setOriginalChecked(false); setStep(ALLOWLIST_IMPORT_STEP.review);
    const confirmation = intent.type === OPERATION.previewAllowlistImport ? COPY.previewed : COPY.confirmed;
    if (writeToastRef.current) writeToastRef.current.announce({ kind: "success", message: confirmation }); else toast.success(confirmation);
  }, [authorityLostRef, currentRef, fetchCurrent, live, persist, setConfirmed, setConflict, setErrorMessage, setOriginalChecked, setStatusMessage, setStep, writeToastRef]);
  /** @param input - Immutable original proposal, its actual state, action scope, render generation and whether it was read back. @returns After original/current reconciliation. */
  const consume = useCallback(async ({ intent, value, signal, scope, originalRead = false }: ConsumeInput) => {
    if (value.operationId !== intent.operationId) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    if (value.state === OPERATION_STATE.started) {
      setOriginalChecked(originalRead); setErrorMessage(COPY.started);
      // The partial results are row outcomes, so the review step shows them before the pending rows are resumed.
      if (intent.type === OPERATION.confirmAllowlistImport && await fetchCurrent(intent.importId, signal, scope)) setStep(ALLOWLIST_IMPORT_STEP.review);
      return;
    }
    const denial = allowlistImportDenialSchema.safeParse(value.result);
    if (denial.success) { consumeDenial(intent, denial.data.code); return; }
    await consumeCompleted(intent, value.result, signal, scope);
  }, [consumeCompleted, consumeDenial, fetchCurrent, setErrorMessage, setOriginalChecked, setStep]);
  /** @param intent - Exact new or explicitly reconciled command. @param signal - Action scope. @param scope - Render generation. @returns After recording before POST and retaining uncertainty after an incomplete reply. */
  const dispatch = useCallback(async (intent: AllowlistImportBrowserIntent, signal: AbortSignal, scope: number) => {
    const prior = currentRef.current.pending;
    const unresolved = prior?.type === OPERATION.confirmAllowlistImport && prior.operationId !== intent.operationId ? [...currentRef.current.unresolved.filter((original) => original.operationId !== prior.operationId), prior] : currentRef.current.unresolved;
    if (!persist({ ...currentRef.current, pending: intent, unresolved })) return;
    setOriginalChecked(false);
    const result = await client.write(requireReadyScope(initial).slug, intent, currentRef.current.draft, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") await consume({ intent, value: result.value, signal, scope });
    else if (result.status === "failed" && !result.uncertain) {
      if (!persist({ ...currentRef.current, pending: null })) return;
      setConfirmed(false); if (reportFailure(result)) return;
      setConflict(result.code === ADMISSION_ERROR_CODE.allowlistImportConflict); setPolicyConflict(result.code === ADMISSION_ERROR_CODE.policyConflict);
      if (!isBlockingImportFailure(result.code)) { setErrorMessage(null); announceFailure(result.message, false); }
    } else { setConfirmed(false); setErrorMessage(COPY.uncertain); }
  }, [announceFailure, authorize, client, consume, currentRef, initial, live, persist, reportFailure, setConfirmed, setConflict, setErrorMessage, setOriginalChecked, setPolicyConflict]);
  return { run, consume, dispatch };
}
type AllowlistImportWrites = ReturnType<typeof useAllowlistImportWrites>;

/** @param state - Workflow state. @param reads - Record and read steps. @param writes - Action runner and consumers. @returns Read-only recovery of the original and the current resource. */
function useAllowlistImportRecovery(state: AllowlistImportState, reads: AllowlistImportReads, writes: AllowlistImportWrites) {
  const { initial, client, currentRef, live, setErrorMessage, setStep } = state;
  const { authorize, reportFailure, fetchCurrent } = reads;
  const { run, consume } = writes;
  const readOriginal = useCallback(() => run(async (signal, scope) => {
    const intent = currentRef.current.pending ?? currentRef.current.unresolved[0];
    if (!intent) return;
    const original = await client.operation(requireReadyScope(initial).slug, intent.operationId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (original.status === "ready" && original.value.type === intent.type) await consume({ intent, value: original.value, signal, scope, originalRead: true });
    else { if (original.status === "failed" && reportFailure(original)) return; setErrorMessage(original.status === "failed" && original.code === ADMISSION_ERROR_CODE.resourceUnavailable ? COPY.absent : COPY.uncertain); }
  }), [authorize, client, consume, currentRef, initial, live, reportFailure, run, setErrorMessage]);
  const readCurrent = useCallback(() => run(async (signal, scope) => { if (currentRef.current.importId && await fetchCurrent(currentRef.current.importId, signal, scope)) setStep((open) => Math.max(open, ALLOWLIST_IMPORT_STEP.review)); }), [currentRef, fetchCurrent, run, setStep]);
  return { readOriginal, readCurrent };
}

/** @param state - Workflow state. @param reads - Identity and current reads. Restores the stored draft once per scope without dispatching any write. */
function useAllowlistImportHydration(state: AllowlistImportState, reads: AllowlistImportReads) {
  const { initial, drafts, initializationRevision, activeRef, generationRef, downloadCleanupRef, controllerRef, occupiedRef, currentRef, authorityLostRef, live, setStored, setStep, setInitializationFailed, setReady, setErrorMessage, setConfirmed, setStatusMessage } = state;
  const { authorize, fetchCurrent } = reads;
  useEffect(() => {
    activeRef.current = true; generationRef.current += 1; const scope = generationRef.current, hydration = new AbortController(), cleanupDownloads = downloadCleanupRef.current;
    const timeout = window.setTimeout(() => { hydration.abort(); if (activeRef.current && generationRef.current === scope) { setInitializationFailed(true); setReady(false); setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); } }, ALLOWLIST_BROWSER_TIMEOUT_MS);
    queueMicrotask(() => { void (async () => {
      setInitializationFailed(false); setReady(false); setErrorMessage(null);
      if (!initial || !await authorize(hydration.signal, scope)) return;
      const restored = await readAllowlistImport(initial.viewerId, initial.slug, { storage: window.sessionStorage, files: drafts, signal: hydration.signal });
      if (!live(hydration.signal, scope) || !await authorize(hydration.signal, scope)) return;
      if (restored) { currentRef.current = restored; setStored(restored); if (restored.importId && await fetchCurrent(restored.importId, hydration.signal, scope)) setStep(currentRef.current.selection.length ? ALLOWLIST_IMPORT_STEP.confirm : ALLOWLIST_IMPORT_STEP.review); }
      if (live(hydration.signal, scope) && !authorityLostRef.current) { setReady(true); setConfirmed(false); if (restored?.pending) setErrorMessage(COPY.uncertain); else if (restored && !restored.draft) setStatusMessage(COPY.missingDraft); }
    })().catch(() => { if (live(hydration.signal, scope)) { setInitializationFailed(true); setErrorMessage(COPY.storage); } }).finally(() => window.clearTimeout(timeout)); });
    return () => { closeAllowlistImportScope({ activeRef, generationRef, controllerRef, occupiedRef }, hydration); window.clearTimeout(timeout); for (const cleanup of cleanupDownloads) cleanup(); cleanupDownloads.clear(); };
  }, [activeRef, authorityLostRef, authorize, controllerRef, currentRef, downloadCleanupRef, drafts, fetchCurrent, generationRef, initial, initializationRevision, live, occupiedRef, setConfirmed, setErrorMessage, setInitializationFailed, setReady, setStatusMessage, setStep, setStored]);
}

/** @param state - Workflow state. @param reads - Record and identity steps. @param writes - Action runner and dispatch. @returns Draft file choice and the preview write. */
function useAllowlistImportDraftActions(state: AllowlistImportState, reads: AllowlistImportReads, writes: AllowlistImportWrites) {
  const { initial, drafts, currentRef, occupiedRef, ready, confirmed, policy, policyConflict, live, snapshotRef, setSnapshot, setConfirmed, setErrorMessage, setFieldError, setStatusMessage, setConflict, setPolicyConflict, setStep } = state;
  const { authorize, persist } = reads;
  const { run, dispatch } = writes;
  /** @param draft - New explicit file data. @param signal - Upload scope. @param scope - Render generation. @returns After durable file storage and small metadata save; replaced input is removed only after its reference changed. */
  const saveChosenDraft = useCallback(async (draft: AllowlistImportDraft, signal: AbortSignal, scope: number) => {
    let saved: Awaited<ReturnType<AllowlistImportDraftStore["save"]>>;
    try { const readyScope = requireReadyScope(initial); saved = await drafts.save(readyScope.viewerId, readyScope.slug, draft, signal); }
    catch { if (live(signal, scope)) setErrorMessage(COPY.storage); return; }
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    const previousId = currentRef.current.draft?.draftId;
    if (!persist({ ...currentRef.current, draft: saved, importId: null, selection: [] })) return;
    snapshotRef.current = null; setSnapshot(null); setConfirmed(false); setErrorMessage(null); setFieldError(null); setStatusMessage(null); setConflict(false); setPolicyConflict(false); setStep(ALLOWLIST_IMPORT_STEP.upload);
    if (previousId && previousId !== saved.draftId) {
      try { await drafts.remove(previousId); }
      catch { console.warn("AllowlistImport:replacedDraftCleanup failed; expired local data will be retried during storage maintenance"); }
    }
  }, [authorize, currentRef, drafts, initial, live, persist, setConfirmed, setConflict, setErrorMessage, setFieldError, setPolicyConflict, setSnapshot, setStatusMessage, setStep, snapshotRef]);
  /** @param draft - Explicit newly selected valid file. @returns After storing one copy and clearing feedback from the old file. */
  const changeDraft = useCallback(async (draft: AllowlistImportDraft) => {
    if (!ready || occupiedRef.current || currentRef.current.pending || currentRef.current.unresolved.length) return;
    const count = countAllowlistImportRows(draft.csvText);
    if (count === null || count === 0) { setFieldError(count === 0 ? COPY.empty : COPY.file); return; }
    await run((signal, scope) => saveChosenDraft(draft, signal, scope), COPY.uploading);
  }, [currentRef, occupiedRef, ready, run, saveChosenDraft, setFieldError]);
  const upload = useCallback((file: File) => run(async (signal, scope) => {
    if (currentRef.current.pending || currentRef.current.unresolved.length) return;
    setConfirmed(false);
    const result = await readAllowlistImportFile(file, signal);
    if (!live(signal, scope)) return;
    if (result.status === "invalid") setFieldError(COPY.file);
    else if (result.status === "ready") { if (result.rowCount === 0) { setFieldError(COPY.empty); return; } await saveChosenDraft(result.draft, signal, scope); }
  }, COPY.uploading), [currentRef, live, run, saveChosenDraft, setConfirmed, setFieldError]);
  const preview = useCallback(async () => {
    if (!ready || occupiedRef.current || currentRef.current.pending || currentRef.current.unresolved.length || !policy.contactType || !policy.version || policyConflict) return;
    if (!confirmed) { setFieldError(COPY.confirmation); return; }
    const count = currentRef.current.draft ? countAllowlistImportRows(currentRef.current.draft.csvText) : null;
    if (count === null || count === 0) { setFieldError(COPY.file); return; }
    const intent: AllowlistImportBrowserIntent = { type: OPERATION.previewAllowlistImport, operationId: newAdmissionOperationId(), expectedPolicyVersion: policy.version, contactType: policy.contactType };
    await run((signal, scope) => dispatch(intent, signal, scope), COPY.previewing, WRITE_ACTION.preview);
  }, [confirmed, currentRef, dispatch, occupiedRef, policy, policyConflict, ready, run, setFieldError]);
  return { changeDraft, upload, preview };
}

/** @param resource - Current saved import. @returns Whether it can no longer be confirmed. */
function isClosedImport(resource: AllowlistImportDto): boolean {
  return resource.state === IMPORT_STATE.completed || resource.state === IMPORT_STATE.expired || resource.state === IMPORT_STATE.cancelled;
}

/** @param state - Workflow state. @param reads - Record step. @param writes - Action runner and dispatch. @returns Row selection and the confirmation write. */
function useAllowlistImportSelection(state: AllowlistImportState, reads: AllowlistImportReads, writes: AllowlistImportWrites) {
  const { currentRef, occupiedRef, ready, confirmed, conflict, originalChecked, snapshotRef, setConfirmed, setFieldError, setErrorMessage, setStatusMessage } = state;
  const { persist } = reads;
  const { run, dispatch } = writes;
  const confirm = useCallback(async () => {
    const resource = snapshotRef.current, pending = currentRef.current.pending;
    if (!ready || occupiedRef.current || conflict || !resource || isClosedImport(resource)) return;
    if (pending && (pending.type !== OPERATION.confirmAllowlistImport || !originalChecked)) return;
    if (Date.parse(resource.expiresAt) <= Date.now()) { setFieldError(COPY.expired); return; }
    if (!confirmed) { setFieldError(COPY.confirmation); return; }
    const selected = new Set(currentRef.current.selection);
    const selectedRows = resource.rows.filter((row) => selected.has(row.rowNumber) && isSelectableAllowlistImportRow(row)).map((row) => row.rowNumber);
    if (selectedRows.length === 0 || selectedRows.length !== currentRef.current.selection.length) { setFieldError(COPY.selection); return; }
    const intent: AllowlistImportBrowserIntent = { type: OPERATION.confirmAllowlistImport, operationId: newAdmissionOperationId(), importId: resource.importId, expectedVersion: resource.sourceVersion, selectedRows };
    await run((signal, scope) => dispatch(intent, signal, scope), COPY.confirming, pending ? WRITE_ACTION.resume : WRITE_ACTION.confirm);
  }, [confirmed, conflict, currentRef, dispatch, occupiedRef, originalChecked, ready, run, setFieldError, snapshotRef]);
  const selectRow = useCallback((rowNumber: number, selected: boolean) => {
    const row = snapshotRef.current?.rows.find((record) => record.rowNumber === rowNumber);
    if (!ready || occupiedRef.current || !row || !isSelectableAllowlistImportRow(row) || currentRef.current.pending && !originalChecked) return;
    const selection = selected ? [...new Set([...currentRef.current.selection, rowNumber])].sort((left, right) => left - right) : currentRef.current.selection.filter((number) => number !== rowNumber);
    if (persist({ ...currentRef.current, selection })) { setConfirmed(false); setFieldError(null); setErrorMessage(null); setStatusMessage(null); }
  }, [currentRef, occupiedRef, originalChecked, persist, ready, setConfirmed, setErrorMessage, setFieldError, setStatusMessage, snapshotRef]);
  /** @param selected - Whether every valid row without a result is chosen, or none. Rows with errors or results are never added, as with one row at a time. */
  const selectAllValidRows = useCallback((selected: boolean) => {
    const resource = snapshotRef.current;
    if (!ready || occupiedRef.current || !resource || currentRef.current.pending && !originalChecked) return;
    if (persist({ ...currentRef.current, selection: selected ? listSelectableAllowlistImportRows(resource.rows) : [] })) { setConfirmed(false); setFieldError(null); setErrorMessage(null); setStatusMessage(null); }
  }, [currentRef, occupiedRef, originalChecked, persist, ready, setConfirmed, setErrorMessage, setFieldError, setStatusMessage, snapshotRef]);
  return { confirm, selectRow, selectAllValidRows };
}

/** @param state - Workflow state. @param reads - Identity and failure steps. @param writes - Action runner and dispatch. @returns Policy refresh, downloads, previous original reconciliation and initialization retry. */
function useAllowlistImportServerActions(state: AllowlistImportState, reads: AllowlistImportReads, writes: AllowlistImportWrites) {
  const { initial, client, currentRef, occupiedRef, authorityLostRef, originalChecked, live, snapshotRef, downloadCleanupRef, setPolicy, setPolicyConflict, setConfirmed, setInitializationRevision } = state;
  const { authorize, reportFailure } = reads;
  const { run, dispatch } = writes;
  const readPolicy = useCallback(() => run(async (signal, scope) => {
    if (currentRef.current.pending) return;
    const result = await client.policy(requireReadyScope(initial).slug, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") { setPolicy({ contactType: result.value.policy?.contactType ?? null, version: result.value.policy?.version ?? null }); setPolicyConflict(false); setConfirmed(false); }
    else if (result.status === "failed") reportFailure(result);
  }), [authorize, client, currentRef, initial, live, reportFailure, run, setConfirmed, setPolicy, setPolicyConflict]);
  const download = useCallback((kind: "template" | "report") => run(async (signal, scope) => {
    const result = await client.file(requireReadyScope(initial).slug, kind, currentRef.current.importId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status !== "ready") { if (result.status === "failed") reportFailure(result); return; }
    const cleanup = downloadAllowlistImportFile(result.value.blob, result.value.fileName, () => downloadCleanupRef.current.delete(cleanup)); downloadCleanupRef.current.add(cleanup); toast.success(COPY.downloaded);
  }), [authorize, client, currentRef, downloadCleanupRef, initial, live, reportFailure, run]);
  const reconcilePrevious = useCallback(() => run(async (signal, scope) => {
    const intent = currentRef.current.unresolved[0], resource = snapshotRef.current;
    const outcomes = new Set(resource?.rows.filter((row) => row.outcome !== undefined).map((row) => row.rowNumber));
    if (!intent || currentRef.current.pending || !originalChecked || !resource || !intent.selectedRows.every((number) => outcomes.has(number))) return;
    await dispatch(intent, signal, scope);
  }, COPY.confirming, WRITE_ACTION.reconcile), [currentRef, dispatch, originalChecked, run, snapshotRef]);
  const retryInitialization = useCallback(() => { if (!occupiedRef.current && !authorityLostRef.current) setInitializationRevision((revision) => revision + 1); }, [authorityLostRef, occupiedRef, setInitializationRevision]);
  return { readPolicy, download, reconcilePrevious, retryInitialization };
}

/** @param options - Safe current SSR scope and explicit browser collaborators. @returns Controlled state/actions; initial hydration never dispatches a write or accepts stored results. */
export function useAllowlistImportWorkflow(options: AllowlistImportWorkflowOptions) {
  const state = useAllowlistImportState(options);
  const reads = useAllowlistImportReads(state);
  const writes = useAllowlistImportWrites(state, reads);
  const { readOriginal, readCurrent } = useAllowlistImportRecovery(state, reads, writes);
  useAllowlistImportHydration(state, reads);
  const { changeDraft, upload, preview } = useAllowlistImportDraftActions(state, reads, writes);
  const { confirm, selectRow, selectAllValidRows } = useAllowlistImportSelection(state, reads, writes);
  const { readPolicy, download, reconcilePrevious, retryInitialization } = useAllowlistImportServerActions(state, reads, writes);
  const { accessLost, ready, busy, writeAction, confirmed, setConfirmed, snapshot, step, setStep, occupiedRef, initializationFailed, stored, privateVisible, errorMessage, fieldError, statusMessage, conflict, policyConflict, policy, originalChecked } = state;
  return { accessLost, ready, busy, writeAction, confirmed, setConfirmed, step: snapshot ? step : ALLOWLIST_IMPORT_STEP.upload, setStep: (value: number) => { if (!occupiedRef.current) setStep(value); }, initializationFailed, retryInitialization, hasSavedImport: stored.importId !== null, draft: stored.draft, snapshot, selection: stored.selection, pending: stored.pending, unresolved: stored.unresolved, privateVisible, errorMessage, fieldError, statusMessage, conflict, policyConflict, policy, originalChecked, changeDraft, upload, preview, confirm, selectRow, selectAllValidRows, readOriginal, readCurrent, readPolicy, download, reconcilePrevious };
}
