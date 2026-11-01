"use client";
/** Owns list actions, scoped persistence and readonly recovery while preserving draft and server authority. @module use-allowlist-workflow */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@golfo/ui";
import { startWriteToast, type WriteToast } from "@/lib/toasts/write-toast";
import { authorizeInitialViewer } from "@/hooks/verify-initial-viewer";
import type { AllowlistPageState, AllowlistBrowserQuery } from "@/src/modules/academy-admissions/application/results/allowlist-page-state";
import type { AllowlistBrowserClient, AllowlistBrowserResult  } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { AllowlistDraft, AllowlistBrowserIntent } from "@/src/modules/academy-admissions/application/commands/allowlist-browser-intent";
import type { AllowlistEntryResult } from "@/src/modules/academy-admissions/application/results/admission-resource-result";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { allowlistApiClient } from "@/lib/academy-admissions/allowlist-api-client";
import { readAllowlistWorkflow, writeAllowlistWorkflow } from "@/lib/academy-admissions/allowlist-intent";
import { ALLOWLIST_BROWSER_PHASE as PHASE, ALLOWLIST_BROWSER_COPY as COPY, ALLOWLIST_BROWSER_TIMEOUT_MS, ALLOWLIST_ENTRY_STEP } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { ALLOWLIST_ENTRY_STATUS } from "@/src/modules/academy-admissions/constants/admission-resources";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { allowlistMutationDenialSchema  } from "@/src/modules/academy-admissions/application/results/allowlist-mutation-schemas";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { appendAdmissionListPage } from "@/lib/academy-admissions/admission-list-pages";
import { isAdmissionAccessLoss } from "@/lib/academy-admissions/admission-access-loss";
import { buildAllowlistIntent, closeAllowlistScope, isAbsentOriginal, mergeAllowlistEntryIntoPage, readOriginalFailureMessage, readUsableMutationResult, requireReadyAllowlist, settleAllowlistRun, type AllowlistPhase } from "@/hooks/use-allowlist-workflow-support";

type AllowlistWorkflowOptions = { initialState: AllowlistPageState; client?: AllowlistBrowserClient };
type FailedAllowlistResult = Extract<AllowlistBrowserResult<unknown>, { status: "failed" }>;
type ConsumeInput = { intent: AllowlistBrowserIntent; value: { state: "started" | "completed"; operationId: string; result?: unknown }; signal: AbortSignal; scope: number; confirmation: string };
type AllowlistRun = (action: (signal: AbortSignal, scope: number) => Promise<void>, writing?: boolean, reportReadFailure?: (message: string) => void) => Promise<void>;

/** @returns A blank proposal; neither consent nor authority is ever restored. */
function emptyDraft(): AllowlistDraft { return { identity: "", country: "", displayName: "", status: ALLOWLIST_ENTRY_STATUS.enabled, entryId: null, expectedVersion: null }; }

/** @param draft - Restored proposal. @returns The first step still pending; consent is never restored, so a complete contact resumes at the review. */
function firstPendingStep(draft: AllowlistDraft): number { return draft.entryId || draft.identity.trim() ? ALLOWLIST_ENTRY_STEP.review : ALLOWLIST_ENTRY_STEP.contact; }

/** @param options - Safe current SSR state and own browser ports. @returns Every state, ref and setter of the workflow. */
function useAllowlistState(options: AllowlistWorkflowOptions) {
  const initial = options.initialState.kind === "ready" ? options.initialState : null, client = options.client ?? allowlistApiClient;
  const [page, setPage] = useState(initial?.page ?? { items: [], nextCursor: null }), [query, setQuery] = useState<AllowlistBrowserQuery>(initial?.query ?? { limit: ADMISSION_QUERY_LIMIT.defaultPageSize });
  const [search, setSearch] = useState(initial?.query.search ?? ""), [status, setStatus] = useState<"enabled" | "disabled" | null>(initial?.query.status ?? null);
  const [draft, setDraft] = useState<AllowlistDraft>(emptyDraft), [confirmed, setConfirmed] = useState(false), [ready, setReady] = useState(false), [privateVisible, setPrivateVisible] = useState(true);
  const [phase, setPhase] = useState<AllowlistPhase>(PHASE.checking), [pending, setPending] = useState<AllowlistBrowserIntent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [fieldError, setFieldError] = useState<string | null>(null), [conflict, setConflict] = useState(false), [step, setStep] = useState<number>(ALLOWLIST_ENTRY_STEP.contact);
  /** «Ver más» keeps the entries already shown, so its progress and its failure belong next to its button. */
  const [loadingMore, setLoadingMore] = useState(false), [moreError, setMoreError] = useState<string | null>(null);
  /** The last consult of the pending original proved it absent: only then may the leader discard it. */
  const [originalAbsent, setOriginalAbsent] = useState(false);
  /** Starts from the server snapshot and follows every list read, so a resolved platform problem re-enables writes in the same session. */
  const [platformRequirement, setPlatformRequirement] = useState<PlatformSecurityRequirement | null>(initial?.platformRequirement ?? null);
  const currentDraftRef = useRef(draft), currentPendingRef = useRef<AllowlistBrowserIntent | null>(null), controllerRef = useRef<AbortController | null>(null), activeRef = useRef(false), generationRef = useRef(0), busyRef = useRef(false), writeToastRef = useRef<WriteToast | null>(null);
  const live = useCallback((signal: AbortSignal, scope: number) => activeRef.current && generationRef.current === scope && !signal.aborted, []);
  return { initial, client, page, setPage, query, setQuery, search, setSearch, status, setStatus, draft, setDraft, confirmed, setConfirmed, ready, setReady, privateVisible, setPrivateVisible, phase, setPhase, pending, setPending, errorMessage, setErrorMessage, fieldError, setFieldError, conflict, setConflict, step, setStep, loadingMore, setLoadingMore, moreError, setMoreError, originalAbsent, setOriginalAbsent, platformRequirement, setPlatformRequirement, currentDraftRef, currentPendingRef, controllerRef, activeRef, generationRef, busyRef, writeToastRef, live };
}
type AllowlistState = ReturnType<typeof useAllowlistState>;

/** @param state - Workflow state. @returns Failure reporting, scoped persistence, identity checks and entry merging. */
function useAllowlistCore(state: AllowlistState) {
  const { initial, client, query, live, currentDraftRef, currentPendingRef, setErrorMessage, setPrivateVisible, setReady, setConfirmed, setPhase, setDraft, setPending, setPage } = state;
  /** Every private read clears visible prior data when its current server authority is lost. */
  const reportFailure = useCallback((failure: FailedAllowlistResult): boolean => {
    setErrorMessage(failure.message);
    const lostAuthority = isAdmissionAccessLoss(failure.code);
    if (lostAuthority) { setPrivateVisible(false); setReady(false); setConfirmed(false); setPhase(PHASE.changedViewer); }
    return lostAuthority;
  }, [setConfirmed, setErrorMessage, setPhase, setPrivateVisible, setReady]);
  /** Saves only owned proposal/references before dispatch, blocking writes if browser storage is unavailable. */
  const persist = useCallback((nextDraft: AllowlistDraft, intent: AllowlistBrowserIntent | null): boolean => {
    if (!initial) return false;
    try { writeAllowlistWorkflow({ viewerId: initial.viewerId, slug: initial.slug, draft: nextDraft, pending: intent }); currentDraftRef.current = nextDraft; currentPendingRef.current = intent; setDraft(nextDraft); setPending(intent); return true; }
    catch { setErrorMessage(COPY.storage); setReady(false); return false; }
  }, [currentDraftRef, currentPendingRef, initial, setDraft, setErrorMessage, setPending, setReady]);
  /** Native account checks surround private responses; a changed account hides every prior contact and continuation. */
  const authorize = useCallback((signal: AbortSignal, scope: number) => authorizeInitialViewer({ client, initial, live, onViewerChanged: () => { setPrivateVisible(false); setReady(false); setConfirmed(false); setPhase(PHASE.changedViewer); setErrorMessage(COPY.account); } }, signal, scope), [client, initial, live, setConfirmed, setErrorMessage, setPhase, setPrivateVisible, setReady]);
  /** Updates one current entry only; historical operation versions never replace newer metadata. */
  const mergeEntry = useCallback((entry: AllowlistEntryResult) => {
    setPage((current) => mergeAllowlistEntryIntoPage(current, entry, query));
  }, [query, setPage]);
  return { reportFailure, persist, authorize, mergeEntry };
}
type AllowlistCore = ReturnType<typeof useAllowlistCore>;

/** @param state - Workflow state. @param core - Shared steps. @returns The reconciliation of a terminal original through current own metadata, without another POST or route refresh. */
function useAllowlistConsume(state: AllowlistState, core: AllowlistCore) {
  const { initial, client, query, page, live, currentDraftRef, writeToastRef, setErrorMessage, setPhase, setConfirmed, setConflict, setStep, setPage, setPlatformRequirement } = state;
  const { reportFailure, persist, authorize, mergeEntry } = core;
  /** @param intent - Denied original. @param code - Recorded denial. Clears the original and shows the denial where it belongs. */
  const consumeDenial = useCallback((intent: AllowlistBrowserIntent, code: keyof typeof ADMISSION_ERROR_MESSAGE) => {
    if (!persist(currentDraftRef.current, null)) return;
    setConfirmed(false); const staleEdit = code === ADMISSION_ERROR_CODE.allowlistConflict && intent.type === REAUTHENTICATION_OPERATION.updateAllowlistEntry; setConflict(staleEdit); setPhase(PHASE.idle);
    if (code === ADMISSION_ERROR_CODE.allowlistConflict) setErrorMessage(staleEdit ? ADMISSION_ERROR_MESSAGE[code] : COPY.duplicate);
    else if (writeToastRef.current) writeToastRef.current.announce({ kind: "error", message: ADMISSION_ERROR_MESSAGE[code] });
    else toast.error(ADMISSION_ERROR_MESSAGE[code]);
  }, [currentDraftRef, persist, setConfirmed, setConflict, setErrorMessage, setPhase, writeToastRef]);
  /** @param signal - Action scope. @param scope - Render generation. @returns Whether the first page was replaced by its current version. */
  const refreshFirstPage = useCallback(async (signal: AbortSignal, scope: number) => {
    const refreshed = await client.list(requireReadyAllowlist(initial).slug, query, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return false;
    if (refreshed.status !== "ready") { if (refreshed.status === "failed" && reportFailure(refreshed)) return false; setPhase(PHASE.uncertain); return false; }
    const { platformRequirement, ...firstPage } = refreshed.value;
    setPage(firstPage); setPlatformRequirement(platformRequirement);
    return true;
  }, [authorize, client, initial, live, query, reportFailure, setPage, setPhase, setPlatformRequirement]);
  /** @param entryId - Written entry. @param signal - Action scope. @param scope - Render generation. @returns Whether the list now shows the written entry's current metadata. */
  const showWrittenEntry = useCallback(async (entryId: string, signal: AbortSignal, scope: number) => {
    const current = await client.read(requireReadyAllowlist(initial).slug, entryId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return false;
    if (current.status !== "ready") { if (current.status === "failed" && reportFailure(current)) return false; setPhase(PHASE.uncertain); return false; }
    if (!query.cursor && !page.items.some((entry) => entry.id === current.value.id) && page.items.length >= query.limit) return refreshFirstPage(signal, scope);
    mergeEntry(current.value);
    return true;
  }, [authorize, client, initial, live, mergeEntry, page.items, query, refreshFirstPage, reportFailure, setPhase]);
  /** @param input - Original, its state, action scope, render generation and the success copy: the save itself (announced by the write's toast), or the recovery of an earlier original. */
  const consume = useCallback(async ({ intent, value, signal, scope, confirmation }: ConsumeInput) => {
    if (value.operationId !== intent.input.operationId) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); setPhase(PHASE.uncertain); return; }
    if (value.state === OPERATION_STATE.started) { setErrorMessage(COPY.started); setPhase(PHASE.uncertain); return; }
    const denial = allowlistMutationDenialSchema.safeParse(value.result);
    if (denial.success) { consumeDenial(intent, denial.data.code); return; }
    const data = readUsableMutationResult(intent, value.result);
    if (!data) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); setPhase(PHASE.uncertain); return; }
    if (!await showWrittenEntry(data.entryId, signal, scope)) return;
    if (!persist(emptyDraft(), null)) return;
    setConfirmed(false); setConflict(false); setStep(ALLOWLIST_ENTRY_STEP.contact); setPhase(PHASE.idle);
    if (writeToastRef.current) writeToastRef.current.announce({ kind: "success", message: confirmation }); else toast.success(confirmation);
  }, [consumeDenial, persist, setConfirmed, setConflict, setErrorMessage, setPhase, setStep, showWrittenEntry, writeToastRef]);
  return { consume };
}

/** @param state - Workflow state. @param core - Shared steps. @param consume - Original reconciliation. @returns The cancellable action slot and the read of the original. */
function useAllowlistRunner(state: AllowlistState, core: AllowlistCore, consume: (input: ConsumeInput) => Promise<void>) {
  const { initial, client, live, busyRef, controllerRef, generationRef, activeRef, writeToastRef, currentPendingRef, setErrorMessage, setFieldError, setPhase, setOriginalAbsent } = state;
  const { authorize, reportFailure } = core;
  /**
   * Each interactive read owns one cancellable slot and cannot replace an unfinished mutation.
   * @param reportReadFailure - Where a read's transport failure is shown; the page alert by default.
   */
  const run: AllowlistRun = useCallback(async (action, writing = false, reportReadFailure) => {
    if (!initial || busyRef.current) return;
    controllerRef.current?.abort(); const next = new AbortController(), scope = generationRef.current; controllerRef.current = next; busyRef.current = true;
    const timeout = window.setTimeout(() => next.abort(), ALLOWLIST_BROWSER_TIMEOUT_MS);
    setErrorMessage(null); setFieldError(null); setPhase(writing ? PHASE.writing : PHASE.reading);
    // A write's outcome goes to its own toast; an unconfirmed original stays on screen instead.
    const notice = writing ? startWriteToast(COPY.saving) : null; writeToastRef.current = notice;
    /** A failure the person can retry: the write's toast for a new write, the page for a read. */
    const fail = (message: string) => { if (notice) notice.announce({ kind: "error", message }); else (reportReadFailure ?? setErrorMessage)(message); };
    try { if (await authorize(next.signal, scope)) await action(next.signal, scope); }
    catch { if (live(next.signal, scope)) { if (currentPendingRef.current) setErrorMessage(COPY.uncertain); else fail(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(currentPendingRef.current ? PHASE.uncertain : PHASE.idle); } }
    finally {
      window.clearTimeout(timeout);
      settleAllowlistRun({ controllerRef, busyRef, activeRef, generationRef, writeToastRef, currentPendingRef }, { next, scope, notice, fail, setErrorMessage, setPhase });
    }
  }, [activeRef, authorize, busyRef, controllerRef, currentPendingRef, generationRef, initial, live, setErrorMessage, setFieldError, setPhase, writeToastRef]);
  const readOriginal = useCallback(() => run(async (signal, scope) => {
    const intent = currentPendingRef.current;
    if (!intent) return;
    setOriginalAbsent(false);
    const original = await client.operation(requireReadyAllowlist(initial).slug, intent.input.operationId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (original.status === "ready" && original.value.type === intent.type) await consume({ intent, value: original.value, signal, scope, confirmation: COPY.recovered });
    else { if (original.status === "failed" && reportFailure(original)) return; setErrorMessage(readOriginalFailureMessage(original)); setOriginalAbsent(isAbsentOriginal(original)); setPhase(PHASE.uncertain); }
  }), [authorize, client, consume, currentPendingRef, initial, live, reportFailure, run, setErrorMessage, setOriginalAbsent, setPhase]);
  return { run, readOriginal };
}

/** @param state - Workflow state. @param core - Identity check. Restores the stored draft once per scope without dispatching any write. */
function useAllowlistHydration(state: AllowlistState, core: AllowlistCore) {
  const { initial, live, activeRef, generationRef, controllerRef, busyRef, currentDraftRef, currentPendingRef, setReady, setErrorMessage, setPhase, setDraft, setPending, setStep, setConfirmed } = state;
  const { authorize } = core;
  useEffect(() => {
    activeRef.current = true; generationRef.current += 1; const scope = generationRef.current, hydration = new AbortController();
    const timeout = window.setTimeout(() => { hydration.abort(); if (activeRef.current && generationRef.current === scope) { setReady(false); setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(PHASE.idle); } }, ALLOWLIST_BROWSER_TIMEOUT_MS);
    queueMicrotask(() => { void (async () => {
      if (!await authorize(hydration.signal, scope)) return;
      try {
        const readyScope = requireReadyAllowlist(initial), stored = readAllowlistWorkflow(readyScope.viewerId, readyScope.slug);
        if (!live(hydration.signal, scope)) return;
        if (stored) { currentDraftRef.current = stored.draft; currentPendingRef.current = stored.pending; setDraft(stored.draft); setPending(stored.pending); setStep(firstPendingStep(stored.draft)); }
        setConfirmed(false); setReady(true); setPhase(stored?.pending ? PHASE.uncertain : PHASE.idle);
      } catch { if (live(hydration.signal, scope)) { setReady(false); setErrorMessage(COPY.storage); setPhase(PHASE.idle); } }
    })().catch(() => { if (live(hydration.signal, scope)) { setReady(false); setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(PHASE.idle); } }).finally(() => window.clearTimeout(timeout)); });
    return () => { closeAllowlistScope({ activeRef, generationRef, controllerRef }, hydration); window.clearTimeout(timeout); busyRef.current = false; };
  }, [activeRef, authorize, busyRef, controllerRef, currentDraftRef, currentPendingRef, generationRef, initial, live, setConfirmed, setDraft, setErrorMessage, setPending, setPhase, setReady, setStep]);
}

/** @param state - Workflow state. @param core - Shared steps. @param run - Cancellable action slot. @returns Filtered reads and the next page. */
function useAllowlistListActions(state: AllowlistState, core: AllowlistCore, run: AllowlistRun) {
  const { initial, client, page, query, live, busyRef, currentPendingRef, setPage, setQuery, setPrivateVisible, setMoreError, setLoadingMore, setPlatformRequirement } = state;
  const { authorize, reportFailure } = core;
  const readList = useCallback((nextQuery: AllowlistBrowserQuery) => run(async (signal, scope) => {
    if (currentPendingRef.current) return;
    const result = await client.list(requireReadyAllowlist(initial).slug, nextQuery, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") { const { platformRequirement, ...nextPage } = result.value; setPage(nextPage); setPlatformRequirement(platformRequirement); setQuery(nextQuery); setPrivateVisible(true); setMoreError(null); }
    else if (result.status === "failed") reportFailure(result);
  }), [authorize, client, currentPendingRef, initial, live, reportFailure, run, setMoreError, setPage, setPlatformRequirement, setPrivateVisible, setQuery]);
  /** Adds the next page below the shown entries without repeating any of them; only a lost authority hides the list. */
  const loadMore = useCallback(async () => {
    const cursor = page.nextCursor;
    if (!initial || !cursor || busyRef.current || currentPendingRef.current) return;
    const nextQuery = { ...query, cursor };
    setMoreError(null); setLoadingMore(true);
    try {
      await run(async (signal, scope) => {
        const result = await client.list(initial.slug, nextQuery, signal);
        if (!live(signal, scope) || !await authorize(signal, scope)) return;
        if (result.status === "ready") { setPage((shown) => ({ items: appendAdmissionListPage(shown.items, result.value.items), nextCursor: result.value.nextCursor })); setPlatformRequirement(result.value.platformRequirement); setQuery(nextQuery); }
        else if (result.status === "failed") { if (isAdmissionAccessLoss(result.code)) reportFailure(result); else setMoreError(result.message); }
      }, false, setMoreError);
    } finally { setLoadingMore(false); }
  }, [authorize, busyRef, client, currentPendingRef, initial, live, page.nextCursor, query, reportFailure, run, setLoadingMore, setMoreError, setPage, setPlatformRequirement, setQuery]);
  return { readList, loadMore };
}

/** @param state - Workflow state. @param core - Shared steps. @param writes - Action slot and original reconciliation. @returns The confirmed save and the read of the current entry. */
function useAllowlistSaveActions(state: AllowlistState, core: AllowlistCore, writes: { run: AllowlistRun; consume: (input: ConsumeInput) => Promise<void> }) {
  const { initial, client, ready, confirmed, conflict, platformRequirement, live, busyRef, currentDraftRef, currentPendingRef, writeToastRef, setFieldError, setErrorMessage, setPhase, setConfirmed, setConflict } = state;
  const { authorize, persist, reportFailure, mergeEntry } = core;
  const { run, consume } = writes;
  /** A conflict, a duplicate or a platform block keeps the form blocked, so it stays next to the form; any other failure is the write's toast. */
  const rejectSave = useCallback((proposal: AllowlistDraft, intent: AllowlistBrowserIntent, result: FailedAllowlistResult) => {
    if (!persist(proposal, null)) return; setConfirmed(false); if (reportFailure(result)) return;
    if (result.code === ADMISSION_ERROR_CODE.allowlistConflict) { const staleEdit = intent.type === REAUTHENTICATION_OPERATION.updateAllowlistEntry; setErrorMessage(staleEdit ? COPY.conflict : COPY.duplicate); setConflict(staleEdit); }
    // Nothing was registered and only the TuTribu team can lift the block, so its copy stays next to the form instead of a passing toast.
    else if (result.code === ADMISSION_ERROR_CODE.platformSecurityUnavailable) setErrorMessage(result.message);
    else { setErrorMessage(null); writeToastRef.current?.announce({ kind: "error", message: result.message }); }
  }, [persist, reportFailure, setConfirmed, setConflict, setErrorMessage, writeToastRef]);
  const save = useCallback(async () => {
    if (!initial?.contactType || platformRequirement || !ready || !confirmed || conflict || currentPendingRef.current || busyRef.current) { if (!confirmed) setFieldError(COPY.confirm); return; }
    const proposal = currentDraftRef.current;
    const intent = buildAllowlistIntent(initial.contactType, proposal);
    if (!intent) { setFieldError(COPY.invalid); return; }
    await run(async (signal, scope) => {
      if (!persist(proposal, intent)) return;
      const result = await client.write(initial.slug, intent, signal);
      if (!live(signal, scope) || !await authorize(signal, scope)) return;
      if (result.status === "ready") await consume({ intent, value: result.value, signal, scope, confirmation: COPY.saved });
      else if (result.status === "failed" && !result.uncertain) rejectSave(proposal, intent, result);
      else { setErrorMessage(COPY.uncertain); setPhase(PHASE.uncertain); }
    }, true);
  }, [authorize, busyRef, client, confirmed, conflict, consume, currentDraftRef, currentPendingRef, initial, live, persist, platformRequirement, ready, rejectSave, run, setErrorMessage, setFieldError, setPhase]);
  const readCurrentEntry = useCallback(() => run(async (signal, scope) => {
    const proposal = currentDraftRef.current;
    if (!proposal.entryId || currentPendingRef.current) return;
    const current = await client.read(requireReadyAllowlist(initial).slug, proposal.entryId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (current.status !== "ready") { if (current.status === "failed") reportFailure(current); return; }
    mergeEntry(current.value); if (!persist({ ...proposal, expectedVersion: current.value.version }, null)) return; setConfirmed(false); setConflict(false); setErrorMessage(null); toast.info(COPY.currentRead);
  }), [authorize, client, currentDraftRef, currentPendingRef, initial, live, mergeEntry, persist, reportFailure, run, setConfirmed, setConflict, setErrorMessage]);
  return { save, readCurrentEntry };
}

/** @param options - Safe current SSR state and own browser ports. @returns Controlled state/actions without POST on mount or full route refresh. */
export function useAllowlistWorkflow(options: AllowlistWorkflowOptions) {
  const state = useAllowlistState(options);
  const core = useAllowlistCore(state);
  const { consume } = useAllowlistConsume(state, core);
  const { run, readOriginal } = useAllowlistRunner(state, core, consume);
  useAllowlistHydration(state, core);
  const { readList, loadMore } = useAllowlistListActions(state, core, run);
  const { save, readCurrentEntry } = useAllowlistSaveActions(state, core, { run, consume });
  const { page, draft, search, setSearch, status, setStatus, confirmed, setConfirmed, ready, privateVisible, phase, setPhase, pending, conflict, setConflict, errorMessage, setErrorMessage, fieldError, setFieldError, step, setStep, loadingMore, moreError, originalAbsent, setOriginalAbsent, platformRequirement, query, busyRef, currentPendingRef, currentDraftRef } = state;
  const { persist } = core;
  const changeDraft = (value: AllowlistDraft) => { if (!busyRef.current && !currentPendingRef.current) { persist(value, null); setConfirmed(false); setFieldError(null); setErrorMessage(null); } };
  /** Selection cannot discard conflict/progress while the original write is unresolved. */
  const select = (entry: AllowlistEntryResult) => { if (busyRef.current || currentPendingRef.current || !ready) return; setConflict(false); changeDraft({ identity: entry.identity, country: "", displayName: entry.displayName ?? "", status: entry.status, entryId: entry.id, expectedVersion: entry.version }); setStep(ALLOWLIST_ENTRY_STEP.details); };
  /** Starting a proposal is explicit and never replaces an unresolved original. */
  const newEntry = () => { if (busyRef.current || currentPendingRef.current || !ready) return; setConflict(false); changeDraft(emptyDraft()); setStep(ALLOWLIST_ENTRY_STEP.contact); };
  /** Forgets an original the server proved absent and keeps the draft; saving again creates a new original. */
  const discardOriginal = () => {
    if (busyRef.current || !currentPendingRef.current || !originalAbsent || !persist(currentDraftRef.current, null)) return;
    setOriginalAbsent(false); setConfirmed(false); setErrorMessage(null); setPhase(PHASE.idle); toast.info(COPY.discarded);
  };
  return { page, draft, search, status, confirmed, ready, privateVisible, phase, pending, conflict, errorMessage, fieldError, step, loadingMore, moreError, originalAbsent, platformRequirement, discardOriginal, setStep: (value: number) => { if (!busyRef.current) setStep(value); }, changeDraft, setConfirmed: (value: boolean) => { if (!ready || busyRef.current || currentPendingRef.current) return; setConfirmed(value); setFieldError(null); }, setSearch: (value: string) => { setSearch(value); setErrorMessage(null); }, setStatus: (value: "enabled" | "disabled" | null) => { setStatus(value); setErrorMessage(null); }, searchEntries: () => readList({ limit: query.limit, ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}) }), next: loadMore, select, newEntry, save, readOriginal, readCurrentEntry,
    /** Rereads the first page of the applied filters, which carries the platform requirement, so a resolved block re-enables entries without a reload. */
    recheckPlatform: () => readList({ limit: query.limit, ...(query.search ? { search: query.search } : {}), ...(query.status ? { status: query.status } : {}) }) };
}
