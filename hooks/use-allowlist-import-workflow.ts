"use client";
/** Owns one viewer-scoped CSV draft, explicit writes and read-only original/current recovery. @module use-allowlist-import-workflow */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { AllowlistBrowserResult } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { ReauthenticationIntentBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import type { AllowlistImportDraftStore } from "@/src/modules/academy-admissions/application/ports/allowlist-import-draft-store";
import type { AllowlistImportBrowserIntent, AllowlistImportDraft } from "@/src/modules/academy-admissions/application/commands/allowlist-import-browser-intent";
import { allowlistImportSchema, type AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";
import { allowlistImportReferenceSchema, allowlistImportConfirmationResultSchema, allowlistImportDenialSchema } from "@/src/modules/academy-admissions/application/results/allowlist-import-operation-schemas";
import { allowlistImportApiClient } from "@/lib/academy-admissions/allowlist-import-api-client";
import { allowlistReauthenticationClient } from "@/lib/academy-admissions/allowlist-reauthentication-client";
import { readAllowlistImport, writeAllowlistImport, type StoredAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";
import { readAllowlistImportFile, countAllowlistImportRows } from "@/lib/academy-admissions/allowlist-import-file-client";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { ALLOWLIST_IMPORT_BROWSER_COPY as COPY, ALLOWLIST_IMPORT_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { ALLOWLIST_BROWSER_TIMEOUT_MS } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { ADMISSION_IMPORT_PUBLIC_STATE as IMPORT_STATE } from "@/src/modules/academy-admissions/constants/admission-management-contract";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION as OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { downloadAllowlistImportFile } from "@/lib/academy-admissions/allowlist-import-file-client";
import { allowlistImportDraftStore } from "@/lib/academy-admissions/allowlist-import-draft-store";

/** @param options - Safe current SSR scope and explicit browser collaborators. @returns Controlled state/actions; initial hydration never dispatches a write or accepts stored results. */
export function useAllowlistImportWorkflow(options: { initialState: AllowlistImportPageState; client?: AllowlistImportBrowserClient; reauthentication?: ReauthenticationIntentBrowserClient; drafts?: AllowlistImportDraftStore }) {
  const initial = options.initialState.kind === "ready" ? options.initialState : null, client = options.client ?? allowlistImportApiClient, reauthentication = options.reauthentication ?? allowlistReauthenticationClient, drafts = options.drafts ?? allowlistImportDraftStore;
  const empty = (): StoredAllowlistImport => ({ viewerId: initial?.viewerId ?? "", slug: initial?.slug ?? "", draft: null, importId: null, selection: [], pending: null, unresolved: [] });
  const [stored, setStored] = useState<StoredAllowlistImport>(empty), current = useRef(stored);
  const [snapshot, setSnapshot] = useState<AllowlistImportDto | null>(null), snapshotRef = useRef<AllowlistImportDto | null>(null);
  const [policy, setPolicy] = useState({ contactType: initial?.contactType ?? null, version: initial?.policyVersion ?? null });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [privateVisible, setPrivateVisible] = useState(true);
  const [initializationFailed, setInitializationFailed] = useState(false), [initializationRevision, setInitializationRevision] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [fieldError, setFieldError] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false), [policyConflict, setPolicyConflict] = useState(false), [originalChecked, setOriginalChecked] = useState(false), [reauthenticationRequired, setReauthenticationRequired] = useState(false), [recoveryHref, setRecoveryHref] = useState<string | null>(null);
  const active = useRef(false), generation = useRef(0), occupied = useRef(false), authorityLost = useRef(false), controller = useRef<AbortController | null>(null), downloadCleanup = useRef(new Set<() => void>());
  const live = (signal: AbortSignal, scope: number) => active.current && generation.current === scope && !signal.aborted;
  /** @param next - One exact owned proposal and references. @returns True only when a new write can recover its identity after navigation. */
  const persist = useCallback((next: StoredAllowlistImport) => {
    try { writeAllowlistImport(next); current.current = next; setStored(next); return true; }
    catch { setErrorMessage(COPY.storage); setReady(false); setInitializationFailed(true); return false; }
  }, []);
  /** @param failure - Safe own feedback. @returns True when every private field must be hidden. */
  const reportFailure = useCallback((failure: Extract<AllowlistBrowserResult<unknown>, { status: "failed" }>) => {
    setErrorMessage(failure.message);
    const denied = failure.code === ADMISSION_ERROR_CODE.authenticationRequired || failure.code === ADMISSION_ERROR_CODE.permissionDenied;
    if (denied) { authorityLost.current = true; setPrivateVisible(false); setReady(false); setConfirmed(false); setRecoveryHref(null); setReauthenticationRequired(false); }
    return denied;
  }, []);
  /** @param signal - Current cancellable action. @param scope - Render generation. @returns Current native identity; stale data can never replace a new account's view. */
  const authorize = useCallback(async (signal: AbortSignal, scope: number) => {
    if (!initial || !live(signal, scope)) return false;
    const viewer = await client.viewer(signal);
    if (!live(signal, scope)) return false;
    if (viewer.status === "aborted") return false;
    if (viewer.status !== "ready" || viewer.value?.id !== initial.viewerId) { authorityLost.current = true; setPrivateVisible(false); setReady(false); setConfirmed(false); setRecoveryHref(null); setErrorMessage(COPY.account); return false; }
    return true;
  }, [client, initial]);
  /** @param importId - Exact owned saved resource. @param signal - Action scope. @param scope - Render generation. @returns Current DTO only; failures preserve prior confirmed progress. */
  const fetchCurrent = useCallback(async (importId: string, signal: AbortSignal, scope: number) => {
    const result = await client.read(initial!.slug, importId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return false;
    if (result.status !== "ready") {
      if (result.status === "failed") {
        if (result.code === ADMISSION_ERROR_CODE.resourceUnavailable) { snapshotRef.current = null; setSnapshot(null); if (!current.current.pending && !current.current.unresolved.length) persist({ ...current.current, importId: null, selection: [] }); }
        reportFailure(result);
      }
      return false;
    }
    const parsed = allowlistImportSchema.safeParse(result.value);
    if (!parsed.success || parsed.data.importId !== importId || snapshotRef.current?.importId === importId && parsed.data.sourceVersion < snapshotRef.current.sourceVersion) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return false; }
    const eligible = new Set(parsed.data.rows.filter((row) => row.errors.length === 0 && row.outcome === undefined).map((row) => row.rowNumber));
    const selection = current.current.selection.filter((number) => eligible.has(number));
    if (selection.length !== current.current.selection.length && !persist({ ...current.current, selection })) return false;
    snapshotRef.current = parsed.data; setSnapshot(parsed.data); setConflict(false); setConfirmed(false);
    return true;
  }, [authorize, client, initial, persist, reportFailure]);
  /** @param action - One user operation. @param message - Own progress copy. @param writing - Whether an original is being dispatched. @returns After bounded action cleanup; cancellation never implies rollback. */
  const run = useCallback(async (action: (signal: AbortSignal, scope: number) => Promise<void>, message: string = COPY.reading, writing = false) => {
    if (!initial || occupied.current || authorityLost.current) return;
    occupied.current = true; setBusy(true); setErrorMessage(null); setFieldError(null); setStatusMessage(message);
    const next = new AbortController(), scope = generation.current; controller.current = next;
    const timeout = window.setTimeout(() => next.abort(), ALLOWLIST_BROWSER_TIMEOUT_MS), notice = writing ? toast.loading(message) : null;
    try { if (await authorize(next.signal, scope)) await action(next.signal, scope); }
    catch { if (live(next.signal, scope)) setErrorMessage(current.current.pending ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable); }
    finally {
      window.clearTimeout(timeout); if (notice !== null) toast.dismiss(notice);
      if (controller.current === next) { occupied.current = false; controller.current = null; if (active.current && generation.current === scope) { setBusy(false); setStatusMessage((currentMessage) => currentMessage === message ? null : currentMessage); if (next.signal.aborted) setErrorMessage(current.current.pending ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable); } }
    }
  }, [authorize, initial]);
  /** @param intent - Immutable original proposal. @param value - Actual original state. @param signal - Action scope. @param scope - Render generation. @returns After original/current reconciliation, without overwriting rows from historical counts. */
  const consume = useCallback(async (intent: AllowlistImportBrowserIntent, value: { operationId: string; state: "started" | "completed"; result?: unknown }, signal: AbortSignal, scope: number, originalRead = false) => {
    if (value.operationId !== intent.operationId) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    if (value.state === OPERATION_STATE.started) { setOriginalChecked(originalRead); setErrorMessage(COPY.started); if (intent.type === OPERATION.confirmAllowlistImport) await fetchCurrent(intent.importId, signal, scope); return; }
    const denial = allowlistImportDenialSchema.safeParse(value.result);
    if (denial.success) { if (!persist({ ...current.current, pending: null, unresolved: current.current.unresolved.filter((original) => original.operationId !== intent.operationId) })) return; setConfirmed(false); setErrorMessage(ADMISSION_ERROR_MESSAGE[denial.data.code]); setConflict(denial.data.code === ADMISSION_ERROR_CODE.allowlistImportConflict); setPolicyConflict(denial.data.code === ADMISSION_ERROR_CODE.policyConflict); return; }
    const parsed = intent.type === OPERATION.previewAllowlistImport ? allowlistImportReferenceSchema.safeParse(value.result) : allowlistImportConfirmationResultSchema.safeParse(value.result);
    if (!parsed.success || intent.type === OPERATION.previewAllowlistImport && parsed.data.sourceVersion !== 1 || intent.type === OPERATION.confirmAllowlistImport && (parsed.data.importId !== intent.importId || parsed.data.sourceVersion < intent.expectedVersion)) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
    if (!persist({ ...current.current, importId: parsed.data.importId, pending: null, unresolved: current.current.unresolved.filter((original) => original.operationId !== intent.operationId) })) return;
    setConfirmed(false); setOriginalChecked(false); setReauthenticationRequired(false); setRecoveryHref(null);
    if (!await fetchCurrent(parsed.data.importId, signal, scope)) {
      if (live(signal, scope) && !authorityLost.current) { setConflict(true); setStatusMessage(current.current.importId ? COPY.currentReadFailed : COPY.historical); }
      return;
    }
    setConfirmed(false); setOriginalChecked(false); setReauthenticationRequired(false); setRecoveryHref(null); setStatusMessage(intent.type === OPERATION.previewAllowlistImport ? COPY.previewed : COPY.confirmed); toast.success(intent.type === OPERATION.previewAllowlistImport ? COPY.previewed : COPY.confirmed);
  }, [fetchCurrent, persist]);
  /** @param intent - Exact new or explicitly reconciled command. @param signal - Action scope. @param scope - Render generation. @returns After recording before POST and retaining uncertainty after an incomplete reply. */
  const dispatch = useCallback(async (intent: AllowlistImportBrowserIntent, signal: AbortSignal, scope: number) => {
    const prior = current.current.pending;
    const unresolved = prior?.type === OPERATION.confirmAllowlistImport && prior.operationId !== intent.operationId ? [...current.current.unresolved.filter((original) => original.operationId !== prior.operationId), prior] : current.current.unresolved;
    if (!persist({ ...current.current, pending: intent, unresolved })) return;
    setOriginalChecked(false);
    const result = await client.write(initial!.slug, intent, current.current.draft, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") await consume(intent, result.value, signal, scope);
    else if (result.status === "failed" && !result.uncertain) {
      if (!persist({ ...current.current, pending: null })) return;
      setConfirmed(false); if (reportFailure(result)) return;
      setConflict(result.code === ADMISSION_ERROR_CODE.allowlistImportConflict); setPolicyConflict(result.code === ADMISSION_ERROR_CODE.policyConflict); setReauthenticationRequired(result.code === ADMISSION_ERROR_CODE.reauthenticationRequired);
    } else { setConfirmed(false); setErrorMessage(COPY.uncertain); }
  }, [authorize, client, consume, initial, persist, reportFailure]);
  const readOriginal = useCallback(() => run(async (signal, scope) => {
    const intent = current.current.pending ?? current.current.unresolved[0];
    if (!intent) return;
    const original = await client.operation(initial!.slug, intent.operationId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (original.status === "ready" && original.value.type === intent.type) await consume(intent, original.value, signal, scope, true);
    else { if (original.status === "failed" && reportFailure(original)) return; setErrorMessage(original.status === "failed" && original.code === ADMISSION_ERROR_CODE.resourceUnavailable ? COPY.absent : COPY.uncertain); }
  }), [authorize, client, consume, initial, reportFailure, run]);
  const readCurrent = useCallback(() => run(async (signal, scope) => { if (current.current.importId) await fetchCurrent(current.current.importId, signal, scope); }), [fetchCurrent, run]);
  useEffect(() => {
    active.current = true; generation.current += 1; const scope = generation.current, hydration = new AbortController(), cleanupDownloads = downloadCleanup.current;
    const timeout = window.setTimeout(() => { hydration.abort(); if (active.current && generation.current === scope) { setInitializationFailed(true); setReady(false); setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); } }, ALLOWLIST_BROWSER_TIMEOUT_MS);
    queueMicrotask(() => { void (async () => {
      setInitializationFailed(false); setReady(false); setErrorMessage(null);
      if (!initial || !await authorize(hydration.signal, scope)) return;
      const restored = await readAllowlistImport(initial.viewerId, initial.slug, window.sessionStorage, drafts, hydration.signal);
      if (!live(hydration.signal, scope) || !await authorize(hydration.signal, scope)) return;
      if (restored) { current.current = restored; setStored(restored); if (restored.importId) await fetchCurrent(restored.importId, hydration.signal, scope); }
      if (live(hydration.signal, scope) && !authorityLost.current) { setReady(true); setConfirmed(false); if (restored?.pending) setErrorMessage(COPY.uncertain); else if (restored && !restored.draft) setStatusMessage(COPY.missingDraft); }
    })().catch(() => { if (live(hydration.signal, scope)) { setInitializationFailed(true); setErrorMessage(COPY.storage); } }).finally(() => window.clearTimeout(timeout)); });
    return () => { active.current = false; generation.current += 1; hydration.abort(); controller.current?.abort(); occupied.current = false; window.clearTimeout(timeout); for (const cleanup of cleanupDownloads) cleanup(); cleanupDownloads.clear(); };
  }, [authorize, drafts, fetchCurrent, initial, initializationRevision]);
  /** @param draft - New explicit file data. @param signal - Upload scope. @param scope - Render generation. @returns After durable file storage and small metadata save; replaced input is removed only after its reference changed. */
  const saveChosenDraft = useCallback(async (draft: AllowlistImportDraft, signal: AbortSignal, scope: number) => {
    let saved: Awaited<ReturnType<AllowlistImportDraftStore["save"]>>;
    try { saved = await drafts.save(initial!.viewerId, initial!.slug, draft, signal); }
    catch { if (live(signal, scope)) setErrorMessage(COPY.storage); return; }
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    const previousId = current.current.draft?.draftId;
    if (!persist({ ...current.current, draft: saved, importId: null, selection: [] })) return;
    snapshotRef.current = null; setSnapshot(null); setConfirmed(false); setErrorMessage(null); setFieldError(null); setStatusMessage(null); setConflict(false); setPolicyConflict(false); setReauthenticationRequired(false); setRecoveryHref(null);
    if (previousId && previousId !== saved.draftId) {
      try { await drafts.remove(previousId); }
      catch { console.warn("AllowlistImport:replacedDraftCleanup failed; expired local data will be retried during storage maintenance"); }
    }
  }, [authorize, drafts, initial, persist]);
  /** @param draft - Explicit newly selected valid file. @returns After storing one copy and clearing feedback from the old file. */
  const changeDraft = useCallback(async (draft: AllowlistImportDraft) => {
    if (!ready || occupied.current || current.current.pending || current.current.unresolved.length) return;
    const count = countAllowlistImportRows(draft.csvText);
    if (count === null || count === 0) { setFieldError(count === 0 ? COPY.empty : COPY.file); return; }
    await run((signal, scope) => saveChosenDraft(draft, signal, scope), COPY.uploading);
  }, [ready, run, saveChosenDraft]);
  const upload = useCallback((file: File) => run(async (signal, scope) => {
    if (current.current.pending || current.current.unresolved.length) return;
    setConfirmed(false);
    const result = await readAllowlistImportFile(file, signal);
    if (!live(signal, scope)) return;
    if (result.status === "invalid") setFieldError(COPY.file);
    else if (result.status === "ready") { if (result.rowCount === 0) { setFieldError(COPY.empty); return; } await saveChosenDraft(result.draft, signal, scope); }
  }, COPY.uploading), [run, saveChosenDraft]);
  const preview = useCallback(async () => {
    if (!ready || occupied.current || current.current.pending || current.current.unresolved.length || !policy.contactType || !policy.version || policyConflict) return;
    if (!confirmed) { setFieldError(COPY.confirmation); return; }
    const count = current.current.draft ? countAllowlistImportRows(current.current.draft.csvText) : null;
    if (count === null || count === 0) { setFieldError(COPY.file); return; }
    const intent: AllowlistImportBrowserIntent = { type: OPERATION.previewAllowlistImport, operationId: newAdmissionOperationId(), expectedPolicyVersion: policy.version, contactType: policy.contactType };
    await run((signal, scope) => dispatch(intent, signal, scope), COPY.previewing, true);
  }, [confirmed, dispatch, policy, policyConflict, ready, run]);
  const confirm = useCallback(async () => {
    const resource = snapshotRef.current, pending = current.current.pending;
    if (!ready || occupied.current || conflict || !resource || resource.state === IMPORT_STATE.completed || resource.state === IMPORT_STATE.expired || resource.state === IMPORT_STATE.cancelled) return;
    if (pending && (pending.type !== OPERATION.confirmAllowlistImport || !originalChecked)) return;
    if (Date.parse(resource.expiresAt) <= Date.now()) { setFieldError(COPY.expired); return; }
    if (!confirmed) { setFieldError(COPY.confirmation); return; }
    const selected = new Set(current.current.selection);
    const selectedRows = resource.rows.filter((row) => selected.has(row.rowNumber) && row.errors.length === 0 && row.outcome === undefined).map((row) => row.rowNumber);
    if (selectedRows.length === 0 || selectedRows.length !== current.current.selection.length) { setFieldError(COPY.selection); return; }
    const intent: AllowlistImportBrowserIntent = { type: OPERATION.confirmAllowlistImport, operationId: newAdmissionOperationId(), importId: resource.importId, expectedVersion: resource.sourceVersion, selectedRows };
    await run((signal, scope) => dispatch(intent, signal, scope), COPY.confirming, true);
  }, [confirmed, conflict, dispatch, originalChecked, ready, run]);
  const selectRow = useCallback((rowNumber: number, selected: boolean) => {
    const row = snapshotRef.current?.rows.find((record) => record.rowNumber === rowNumber);
    if (!ready || occupied.current || !row || row.errors.length || row.outcome || current.current.pending && !originalChecked) return;
    const selection = selected ? [...new Set([...current.current.selection, rowNumber])].sort((left, right) => left - right) : current.current.selection.filter((number) => number !== rowNumber);
    if (persist({ ...current.current, selection })) { setConfirmed(false); setFieldError(null); setErrorMessage(null); setStatusMessage(null); }
  }, [originalChecked, persist, ready]);
  const readPolicy = useCallback(() => run(async (signal, scope) => {
    if (current.current.pending) return;
    const result = await client.policy(initial!.slug, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") { setPolicy({ contactType: result.value.policy?.contactType ?? null, version: result.value.policy?.version ?? null }); setPolicyConflict(false); setConfirmed(false); }
    else if (result.status === "failed") reportFailure(result);
  }), [authorize, client, initial, reportFailure, run]);
  const reauthenticate = useCallback(() => run(async (signal, scope) => {
    const intent = current.current.pending, resource = snapshotRef.current;
    if (intent && !originalChecked) return;
    const operation = resource ? OPERATION.confirmAllowlistImport : OPERATION.previewAllowlistImport, resourceId = resource?.importId ?? initial!.tribeId;
    const result = await reauthentication.create({ tribeId: initial!.tribeId, resourceId, operation, returnPath: `/${encodeURIComponent(initial!.slug)}/${ALLOWLIST_IMPORT_SETTINGS_SEGMENT}`, confirmed: true }, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") { setRecoveryHref(result.href); setStatusMessage(COPY.reauthentication); } else if (result.status === "failed") setErrorMessage(COPY.reauthenticationFailed);
  }), [authorize, initial, originalChecked, reauthentication, run]);
  const download = useCallback((kind: "template" | "report") => run(async (signal, scope) => {
    const result = await client.file(initial!.slug, kind, current.current.importId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status !== "ready") { if (result.status === "failed") reportFailure(result); return; }
    const cleanup = downloadAllowlistImportFile(result.value.blob, result.value.fileName, () => downloadCleanup.current.delete(cleanup)); downloadCleanup.current.add(cleanup); setStatusMessage(COPY.downloaded);
  }), [authorize, client, initial, reportFailure, run]);
  const reconcilePrevious = useCallback(() => run(async (signal, scope) => {
    const intent = current.current.unresolved[0], resource = snapshotRef.current;
    const outcomes = new Set(resource?.rows.filter((row) => row.outcome !== undefined).map((row) => row.rowNumber));
    if (!intent || current.current.pending || !originalChecked || !resource || !intent.selectedRows.every((number) => outcomes.has(number))) return;
    await dispatch(intent, signal, scope);
  }, COPY.confirming, true), [dispatch, originalChecked, run]);
  const retryInitialization = useCallback(() => { if (!occupied.current && !authorityLost.current) setInitializationRevision((revision) => revision + 1); }, []);
  return { ready, busy, confirmed, setConfirmed, initializationFailed, retryInitialization, hasSavedImport: stored.importId !== null, draft: stored.draft, snapshot, selection: stored.selection, pending: stored.pending, unresolved: stored.unresolved, privateVisible, errorMessage, fieldError, statusMessage, conflict, policyConflict, policy, originalChecked, reauthenticationRequired, recoveryHref, changeDraft, upload, preview, confirm, selectRow, readOriginal, readCurrent, readPolicy, reauthenticate, download, reconcilePrevious };
}
