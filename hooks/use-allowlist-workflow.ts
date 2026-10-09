"use client";
/** Owns list actions, scoped persistence and readonly recovery while preserving draft and server authority. @module use-allowlist-workflow */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";
import type { AllowlistPageState, AllowlistBrowserQuery } from "@/src/modules/academy-admissions/application/results/allowlist-page-state";
import type { AllowlistBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { AllowlistDraft, AllowlistBrowserIntent } from "@/src/modules/academy-admissions/application/commands/allowlist-browser-intent";
import type { AllowlistEntryResult } from "@/src/modules/academy-admissions/application/results/admission-resource-result";
import type { ReauthenticationIntentBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import { allowlistApiClient } from "@/lib/academy-admissions/allowlist-api-client";
import { allowlistReauthenticationClient } from "@/lib/academy-admissions/allowlist-reauthentication-client";
import { readAllowlistWorkflow, writeAllowlistWorkflow } from "@/lib/academy-admissions/allowlist-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { normalizeAllowlistDisplayName } from "@/src/modules/academy-admissions/domain/value-objects/allowlist-display-name";
import { ALLOWLIST_BROWSER_PHASE as PHASE, ALLOWLIST_BROWSER_COPY as COPY, ALLOWLIST_BROWSER_TIMEOUT_MS, ALLOWLIST_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { ALLOWLIST_ENTRY_STATUS } from "@/src/modules/academy-admissions/constants/admission-resources";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { allowlistMutationResultSchema } from "@/src/modules/academy-admissions/application/results/allowlist-mutation-schemas";
import { allowlistMutationDenialSchema } from "@/src/modules/academy-admissions/application/results/allowlist-mutation-schemas";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import type { AllowlistBrowserResult } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";

/** @returns A blank proposal; neither consent nor authority is ever restored. */
function emptyDraft(): AllowlistDraft { return { identity: "", country: "", displayName: "", status: ALLOWLIST_ENTRY_STATUS.enabled, entryId: null, expectedVersion: null }; }

/** @param options - Safe current SSR state and own browser ports. @returns Controlled state/actions without POST on mount or full route refresh. */
export function useAllowlistWorkflow(options: { initialState: AllowlistPageState; client?: AllowlistBrowserClient; reauthentication?: ReauthenticationIntentBrowserClient }) {
  const initial = options.initialState.kind === "ready" ? options.initialState : null, client = options.client ?? allowlistApiClient, reauthentication = options.reauthentication ?? allowlistReauthenticationClient;
  const [page, setPage] = useState(initial?.page ?? { items: [], nextCursor: null }), [query, setQuery] = useState<AllowlistBrowserQuery>(initial?.query ?? { limit: ADMISSION_QUERY_LIMIT.defaultPageSize });
  const [search, setSearch] = useState(initial?.query.search ?? ""), [status, setStatus] = useState<"enabled" | "disabled" | null>(initial?.query.status ?? null);
  const [draft, setDraft] = useState<AllowlistDraft>(emptyDraft), [confirmed, setConfirmed] = useState(false), [ready, setReady] = useState(false), [privateVisible, setPrivateVisible] = useState(true);
  const [phase, setPhase] = useState<typeof PHASE[keyof typeof PHASE]>(PHASE.checking), [pending, setPending] = useState<AllowlistBrowserIntent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null), [fieldError, setFieldError] = useState<string | null>(null), [conflict, setConflict] = useState(false), [reauthenticationRequired, setReauthenticationRequired] = useState(false), [recoveryHref, setRecoveryHref] = useState<string | null>(null);
  const currentDraft = useRef(draft), currentPending = useRef<AllowlistBrowserIntent | null>(null), controller = useRef<AbortController | null>(null), active = useRef(false), generation = useRef(0), busy = useRef(false);
  const live = (signal: AbortSignal, scope: number) => active.current && generation.current === scope && !signal.aborted;

  /** Every private read clears visible prior data when its current server authority is lost. */
  const reportFailure = useCallback((failure: Extract<AllowlistBrowserResult<unknown>, { status: "failed" }>): boolean => {
    setErrorMessage(failure.message);
    const lostAuthority = failure.code === ADMISSION_ERROR_CODE.permissionDenied || failure.code === ADMISSION_ERROR_CODE.authenticationRequired;
    if (lostAuthority) { setPrivateVisible(false); setReady(false); setConfirmed(false); setRecoveryHref(null); setReauthenticationRequired(false); setPhase(PHASE.changedViewer); }
    return lostAuthority;
  }, []);

  /** Saves only owned proposal/references before dispatch, blocking writes if browser storage is unavailable. */
  const persist = useCallback((nextDraft: AllowlistDraft, intent: AllowlistBrowserIntent | null): boolean => {
    if (!initial) return false;
    try { writeAllowlistWorkflow({ viewerId: initial.viewerId, slug: initial.slug, draft: nextDraft, pending: intent }); currentDraft.current = nextDraft; currentPending.current = intent; setDraft(nextDraft); setPending(intent); return true; }
    catch { setErrorMessage(COPY.storage); setReady(false); return false; }
  }, [initial]);

  /** Native account checks surround private responses; a changed account hides every prior contact and continuation. */
  const authorize = useCallback(async (signal: AbortSignal, scope: number) => {
    if (!initial || !live(signal, scope)) return false;
    const viewer = await client.viewer(signal);
    if (!live(signal, scope)) return false;
    if (viewer.status === "aborted") return false;
    if (viewer.status !== "ready" || viewer.value?.id !== initial.viewerId) { setPrivateVisible(false); setReady(false); setConfirmed(false); setRecoveryHref(null); setPhase(PHASE.changedViewer); setErrorMessage(COPY.account); return false; }
    return true;
  }, [client, initial]);

  /** Updates one current entry only; historical operation versions never replace newer metadata. */
  const mergeEntry = useCallback((entry: AllowlistEntryResult) => {
    setPage((current) => {
      const existing = current.items.find((item) => item.id === entry.id);
      if (existing && existing.version > entry.version) return current;
      const searchTerm = query.search?.toLowerCase();
      const matches = (!query.status || entry.status === query.status) && (!searchTerm || entry.identity.toLowerCase().includes(searchTerm) || (entry.displayName ?? "").toLowerCase().includes(searchTerm));
      const remaining = current.items.filter((item) => item.id !== entry.id);
      if (matches && !existing && (query.cursor || current.items.length >= query.limit)) return current;
      const items = matches ? existing ? current.items.map((item) => item.id === entry.id ? entry : item) : [entry, ...remaining] : remaining;
      return { ...current, items };
    });
  }, [query]);

  /** A terminal original is reconciled through current own metadata, without another POST or route refresh. */
  const consume = useCallback(async (intent: AllowlistBrowserIntent, value: { state: "started" | "completed"; operationId: string; result?: unknown }, signal: AbortSignal, scope: number) => {
    if (value.operationId !== intent.input.operationId) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); setPhase(PHASE.uncertain); return; }
    if (value.state === OPERATION_STATE.started) { setErrorMessage(COPY.started); setPhase(PHASE.uncertain); return; }
    const denial = allowlistMutationDenialSchema.safeParse(value.result);
    if (denial.success) { if (!persist(currentDraft.current, null)) return; setConfirmed(false); const staleEdit = denial.data.code === ADMISSION_ERROR_CODE.allowlistConflict && intent.type === REAUTHENTICATION_OPERATION.updateAllowlistEntry; setErrorMessage(denial.data.code === ADMISSION_ERROR_CODE.allowlistConflict && !staleEdit ? COPY.duplicate : ADMISSION_ERROR_MESSAGE[denial.data.code]); setConflict(staleEdit); setPhase(PHASE.idle); return; }
    const parsed = allowlistMutationResultSchema.safeParse(value.result);
    if (!parsed.success || intent.type === REAUTHENTICATION_OPERATION.updateAllowlistEntry && (parsed.data.entryId !== intent.entryId || parsed.data.created || parsed.data.version !== intent.input.expectedVersion + (parsed.data.changed ? 1 : 0))) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); setPhase(PHASE.uncertain); return; }
    const current = await client.read(initial!.slug, parsed.data.entryId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (current.status !== "ready") { if (current.status === "failed" && reportFailure(current)) return; setPhase(PHASE.uncertain); return; }
    if (!query.cursor && !page.items.some((entry) => entry.id === current.value.id) && page.items.length >= query.limit) {
      const refreshed = await client.list(initial!.slug, query, signal);
      if (!live(signal, scope) || !await authorize(signal, scope)) return;
      if (refreshed.status !== "ready") { if (refreshed.status === "failed" && reportFailure(refreshed)) return; setPhase(PHASE.uncertain); return; }
      setPage(refreshed.value);
    } else mergeEntry(current.value);
    if (!persist(emptyDraft(), null)) return;
    setConfirmed(false); setConflict(false); setReauthenticationRequired(false); setRecoveryHref(null); setStatusMessage(COPY.recovered); setPhase(PHASE.idle); toast.success(COPY.saved);
  }, [authorize, client, initial, mergeEntry, page.items, persist, query, reportFailure]);

  /** Each interactive read owns one cancellable slot and cannot replace an unfinished mutation. */
  const run = useCallback(async (action: (signal: AbortSignal, scope: number) => Promise<void>, writing = false) => {
    if (!initial || busy.current) return;
    controller.current?.abort(); const next = new AbortController(), scope = generation.current; controller.current = next; busy.current = true;
    const timeout = window.setTimeout(() => next.abort(), ALLOWLIST_BROWSER_TIMEOUT_MS);
    setErrorMessage(null); setStatusMessage(null); setFieldError(null); setPhase(writing ? PHASE.writing : PHASE.reading);
    const notice = writing ? toast.loading(COPY.saving) : null;
    try { if (await authorize(next.signal, scope)) await action(next.signal, scope); }
    catch { if (live(next.signal, scope)) { setErrorMessage(currentPending.current ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(currentPending.current ? PHASE.uncertain : PHASE.idle); } }
    finally {
      window.clearTimeout(timeout); if (notice !== null) toast.dismiss(notice);
      if (controller.current === next) { controller.current = null; busy.current = false; if (active.current && generation.current === scope) { if (next.signal.aborted && currentPending.current) { setErrorMessage(COPY.uncertain); setPhase(PHASE.uncertain); } else if (next.signal.aborted) { setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(PHASE.idle); } else setPhase((current) => current === PHASE.changedViewer || current === PHASE.uncertain ? current : PHASE.idle); } }
    }
  }, [authorize, initial]);

  const readOriginal = useCallback(() => run(async (signal, scope) => {
    const intent = currentPending.current;
    if (!intent) return;
    const original = await client.operation(initial!.slug, intent.input.operationId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (original.status === "ready" && original.value.type === intent.type) await consume(intent, original.value, signal, scope);
    else { if (original.status === "failed" && reportFailure(original)) return; setErrorMessage(original.status === "failed" && original.code === ADMISSION_ERROR_CODE.resourceUnavailable ? COPY.absent : original.status === "failed" ? original.message : COPY.uncertain); setPhase(PHASE.uncertain); }
  }), [authorize, client, consume, initial, reportFailure, run]);

  useEffect(() => {
    active.current = true; generation.current += 1; const scope = generation.current, hydration = new AbortController();
    const timeout = window.setTimeout(() => { hydration.abort(); if (active.current && generation.current === scope) { setReady(false); setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(PHASE.idle); } }, ALLOWLIST_BROWSER_TIMEOUT_MS);
    queueMicrotask(() => { void (async () => {
      if (!await authorize(hydration.signal, scope)) return;
      try {
        const stored = readAllowlistWorkflow(initial!.viewerId, initial!.slug);
        if (!live(hydration.signal, scope)) return;
        if (stored) { currentDraft.current = stored.draft; currentPending.current = stored.pending; setDraft(stored.draft); setPending(stored.pending); }
        setConfirmed(false); setReady(true); setPhase(stored?.pending ? PHASE.uncertain : PHASE.idle);
      } catch { if (live(hydration.signal, scope)) { setReady(false); setErrorMessage(COPY.storage); setPhase(PHASE.idle); } }
    })().catch(() => { if (live(hydration.signal, scope)) { setReady(false); setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); setPhase(PHASE.idle); } }).finally(() => window.clearTimeout(timeout)); });
    return () => { active.current = false; generation.current += 1; hydration.abort(); controller.current?.abort(); window.clearTimeout(timeout); busy.current = false; };
  }, [authorize, initial]);

  const readList = useCallback((nextQuery: AllowlistBrowserQuery) => run(async (signal, scope) => {
    if (currentPending.current) return;
    const result = await client.list(initial!.slug, nextQuery, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") { setPage(result.value); setQuery(nextQuery); setPrivateVisible(true); }
    else if (result.status === "failed") reportFailure(result);
  }), [authorize, client, initial, reportFailure, run]);

  const save = useCallback(async () => {
    if (!initial?.contactType || !ready || !confirmed || conflict || currentPending.current || busy.current) { if (!confirmed) setFieldError(COPY.confirm); return; }
    const proposal = currentDraft.current;
    let intent: AllowlistBrowserIntent;
    try {
      const displayName = normalizeAllowlistDisplayName(proposal.displayName), operationId = newAdmissionOperationId();
      if (proposal.entryId && proposal.expectedVersion) intent = { type: REAUTHENTICATION_OPERATION.updateAllowlistEntry, entryId: proposal.entryId, input: { operationId, confirmed: true, expectedVersion: proposal.expectedVersion, displayName, status: proposal.status } };
      else { const normalized = normalizeAdmissionContact({ type: initial.contactType, value: proposal.identity, country: proposal.country || undefined }); if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) { setFieldError(COPY.invalid); return; } intent = { type: REAUTHENTICATION_OPERATION.createAllowlistEntry, input: { operationId, confirmed: true, contactType: initial.contactType, identity: normalized.contact.value, ...(normalized.contact.type === "phone" ? { country: normalized.contact.country } : {}), displayName } }; }
    } catch { setFieldError(COPY.invalid); return; }
    await run(async (signal, scope) => {
      if (!persist(proposal, intent)) return;
      const result = await client.write(initial.slug, intent, signal);
      if (!live(signal, scope) || !await authorize(signal, scope)) return;
      if (result.status === "ready") await consume(intent, result.value, signal, scope);
      else if (result.status === "failed" && !result.uncertain) { if (!persist(proposal, null)) return; setConfirmed(false); if (reportFailure(result)) return; const staleEdit = result.code === ADMISSION_ERROR_CODE.allowlistConflict && intent.type === REAUTHENTICATION_OPERATION.updateAllowlistEntry; setErrorMessage(result.code === ADMISSION_ERROR_CODE.allowlistConflict ? staleEdit ? COPY.conflict : COPY.duplicate : result.message); setConflict(staleEdit); setReauthenticationRequired(result.code === ADMISSION_ERROR_CODE.reauthenticationRequired); toast.error(result.message); }
      else { setErrorMessage(COPY.uncertain); setPhase(PHASE.uncertain); }
    }, true);
  }, [authorize, client, confirmed, conflict, consume, initial, persist, ready, reportFailure, run]);

  const readCurrentEntry = useCallback(() => run(async (signal, scope) => {
    const proposal = currentDraft.current;
    if (!proposal.entryId || currentPending.current) return;
    const current = await client.read(initial!.slug, proposal.entryId, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (current.status !== "ready") { if (current.status === "failed") reportFailure(current); return; }
    mergeEntry(current.value); if (!persist({ ...proposal, expectedVersion: current.value.version }, null)) return; setConfirmed(false); setConflict(false); setStatusMessage("Versión actual consultada. Revisá el borrador y confirmá el cambio nuevamente.");
  }), [authorize, client, initial, mergeEntry, persist, reportFailure, run]);

  const reauthenticate = useCallback(() => run(async (signal, scope) => {
    if (!initial || !reauthenticationRequired) return;
    const proposal = currentDraft.current, operation = proposal.entryId ? REAUTHENTICATION_OPERATION.updateAllowlistEntry : REAUTHENTICATION_OPERATION.createAllowlistEntry;
    const result = await reauthentication.create({ tribeId: initial.tribeId, resourceId: proposal.entryId ?? initial.tribeId, operation, returnPath: `/${encodeURIComponent(initial.slug)}/${ALLOWLIST_SETTINGS_SEGMENT}`, confirmed: true }, signal);
    if (!live(signal, scope) || !await authorize(signal, scope)) return;
    if (result.status === "ready") { setRecoveryHref(result.href); setStatusMessage(COPY.reauthentication); } else if (result.status === "failed") setErrorMessage(COPY.reauthenticationFailed);
  }), [authorize, initial, reauthentication, reauthenticationRequired, run]);

  const changeDraft = (value: AllowlistDraft) => { if (!busy.current && !currentPending.current) { persist(value, null); setConfirmed(false); setFieldError(null); setErrorMessage(null); setStatusMessage(null); setReauthenticationRequired(false); setRecoveryHref(null); } };
  /** Selection cannot discard conflict/progress while the original write is unresolved. */
  const select = (entry: AllowlistEntryResult) => { if (busy.current || currentPending.current || !ready) return; setConflict(false); changeDraft({ identity: entry.identity, country: "", displayName: entry.displayName ?? "", status: entry.status, entryId: entry.id, expectedVersion: entry.version }); };
  /** Starting a proposal is explicit and never replaces an unresolved original. */
  const newEntry = () => { if (busy.current || currentPending.current || !ready) return; setConflict(false); changeDraft(emptyDraft()); };
  return { page, draft, search, status, confirmed, ready, privateVisible, phase, pending, conflict, errorMessage, statusMessage, fieldError, recoveryHref, reauthenticationRequired, changeDraft, setConfirmed: (value: boolean) => { if (!ready || busy.current || currentPending.current) return; setConfirmed(value); setFieldError(null); }, setSearch: (value: string) => { setSearch(value); setErrorMessage(null); setStatusMessage(null); }, setStatus: (value: "enabled" | "disabled" | null) => { setStatus(value); setErrorMessage(null); setStatusMessage(null); }, searchEntries: () => readList({ limit: query.limit, ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}) }), next: () => page.nextCursor ? readList({ ...query, cursor: page.nextCursor }) : Promise.resolve(), select, newEntry, save, readOriginal, readCurrentEntry, reauthenticate };
}
