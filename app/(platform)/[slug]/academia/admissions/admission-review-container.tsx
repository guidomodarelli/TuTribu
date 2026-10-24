"use client";
/** Owns native viewer checks, reviewer reads and original decision reconciliation. @module admission-review-container */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import type { AdmissionBatchResultDto, AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionTransitionResult } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { AdmissionReview } from "@/components/academy-admissions/admission-review";
import { AdmissionReviewFilters } from "@/components/academy-admissions/admission-review-filters";
import { AdmissionBatchReview } from "@/components/academy-admissions/admission-batch-review";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { readAdmissionReviewIntent, writeAdmissionReviewIntent, admissionReviewIntentSchema, admissionBatchReviewIntentSchema, type AdmissionBatchReviewSelection, type AdmissionStoredReviewIntent } from "@/lib/academy-admissions/admission-review-intent";
import { isAdmissionBatchReviewIntent } from "@/src/modules/academy-admissions/application/results/admission-review-intent";
import { createAdmissionBatchDecisionInput, getAdmissionBatchReviewTransitions, projectAdmissionBatchReviewRecovery } from "@/src/modules/academy-admissions/application/results/admission-batch-browser-result";
import { ADMISSION_BATCH_REVIEW_COPY } from "@/src/modules/academy-admissions/constants/admission-batch-review-ui";
import { ADMISSION_BATCH_DECISION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-batch-decision";
import { ADMISSION_REVIEW_UI_COPY, ADMISSION_REVIEW_PHASE, ADMISSION_REVIEW_PENDING_ACTION, type AdmissionReviewPendingAction } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OPERATION_TYPE, ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { ADMISSION_REVIEW_FILTER_COPY } from "@/src/modules/academy-admissions/constants/admission-review-filters";
import { createAdmissionReviewFilterDraft, parseAdmissionReviewFilterDraft, buildAdmissionReviewSelectionRoute, type AdmissionReviewDateFilter } from "@/lib/academy-admissions/admission-review-filters";
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";
import { buildAdmissionReviewHistoryRoute } from "@/lib/academy-admissions/admission-review-history-routes";
import { applyAdmissionReviewTransition, matchesAdmissionReviewTransitionSelection } from "@/src/modules/academy-admissions/application/results/admission-review-transition";
import { useAdmissionNotificationRefresh } from "@/hooks/use-admission-notification-refresh";
import { useAdmissionViewFeedback } from "@/hooks/use-admission-view-feedback";
import { useReplacedActionFocus } from "@/hooks/use-replaced-action-focus";
import { useAdmissionReviewBatchSelection } from "@/hooks/use-admission-review-batch-selection";
import { invalidateAdmissionNotificationRefresh } from "@/lib/notifications/admission-notification-refresh-store";
import { readVisibleAdmissionReviewSnapshot } from "@/lib/academy-admissions/admission-review-refresh-client";
import { NOTIFICATION_REFRESH_OUTCOME } from "@/src/modules/notifications/constants/admission-notification-refresh";
import type { AdmissionNotificationRefreshOutcome } from "@/src/modules/notifications/application/results/notification-refresh-state";

/** Public props contain the server snapshot and an optional own transport port for behavioral tests. */
type ReviewContainerProps = { initialState: AdmissionReviewPageState; client?: AdmissionReviewBrowserClient };

/** @param props - Guarded deterministic server state and own client adapter. @returns A single route owner; presenters receive callbacks only. */
export function AdmissionReviewContainer({ initialState, client = admissionApiClient }: ReviewContainerProps) {
  const ready = initialState.kind === "ready" ? initialState : null;
  const router = useRouter(), [navigating, startNavigation] = useTransition();
  const appliedFilters = ready?.filters ?? DEFAULT_ADMISSION_REVIEW_SELECTION;
  const [filterDraft, setFilterDraft] = useState(() => createAdmissionReviewFilterDraft(appliedFilters));
  const [filterError, setFilterError] = useState<string | null>(null);
  const editedDateFilters = useRef(new Set<AdmissionReviewDateFilter>());
  const [items, setItems] = useState<AdmissionReviewDto[]>(ready?.page.items ?? []), [cursor, setCursor] = useState(ready?.page.nextCursor ?? null);
  const [selected, setSelected] = useState<AdmissionReviewDto | null>(ready?.selected ?? null);
  const [phase, setPhase] = useState<"idle" | "reading" | "writing" | "uncertain" | "changed_viewer">(ADMISSION_REVIEW_PHASE.idle);
  /** The write the reviewer pressed; it only counts while the writing phase lasts. */
  const [writingAction, setWritingAction] = useState<AdmissionReviewPendingAction | null>(null);
  const [fresh, setFresh] = useState(false), [confirmed, setConfirmed] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [privateVisible, setPrivateVisible] = useState(true);
  const [internalReason, setInternalReason] = useState(""), [externalMessage, setExternalMessage] = useState("");
  const { errorMessage, setErrorMessage, setReadErrorMessage, clearReadError } = useAdmissionViewFeedback();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const { resultRef: decisionStatusRef, captureActionFocus, finishActionFocus } = useReplacedActionFocus({
    scopeKey: ready ? `${ready.viewerId}:${ready.slug}` : "",
    resultKey: `${selected?.id ?? ""}:${selected?.status ?? ""}`,
    enabled: Boolean(ready && privateVisible && phase !== ADMISSION_REVIEW_PHASE.changedViewer),
  });
  const { selection: batchSelection, confirmed: batchConfirmed, actions: batchActions } = useAdmissionReviewBatchSelection();
  const [batchManifest, setBatchManifest] = useState<AdmissionBatchReviewSelection[]>([]), [batchPending, setBatchPending] = useState(false);
  const [batchResult, setBatchResult] = useState<AdmissionBatchResultDto | null>(null);
  const pending = useRef<AdmissionStoredReviewIntent | null>(null), currentSelected = useRef(selected), loaded = useRef(false), busy = useRef(false);
  const currentItems = useRef<AdmissionReviewDto[]>(ready?.page.items ?? []);
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);
  const consumedSnapshotAt = useRef<string | null>(null);
  const visibleReadRevision = useRef(0), loadedPageCount = useRef(1);

  /** Publishes one current data window and invalidates only selections that no longer name its original visible versions. */
  const publishItems = useCallback((next: AdmissionReviewDto[]) => {
    if (!pending.current && batchActions.reconcile(next)) setStatusMessage(ADMISSION_BATCH_REVIEW_COPY.selectionChanged);
    if (JSON.stringify(currentItems.current) === JSON.stringify(next)) return;
    currentItems.current = next; setItems(next);
  }, [batchActions]);

  /** Hides previous-account or revoked-audience facts before showing recovery controls. */
  const hidePrivate = useCallback((message: string, changed = false) => {
    currentItems.current = []; setItems([]); setSelected(null); currentSelected.current = null; setCursor(null); setFresh(false); setConfirmed(false); setCanRetry(false); setPrivateVisible(false);
    setInternalReason(""); setExternalMessage(""); setErrorMessage(message);
    batchActions.clear(); setBatchManifest([]); setBatchResult(null);
    if (changed) setPhase(ADMISSION_REVIEW_PHASE.changedViewer);
  }, [setErrorMessage, batchActions]);

  /** @param signal - Original current read or write. @param quiet - Keeps background transport failures separate from existing form feedback. @returns Current native identity without inheriting another account's state. */
  const checkViewer = useCallback(async (signal: AbortSignal, quiet = false): Promise<boolean> => {
    if (!ready || signal.aborted) return false;
    const viewer = await client.viewer(signal);
    if (signal.aborted || viewer.status === "aborted") return false;
    if (viewer.status === "failed") { if (!quiet) { setPrivateVisible(false); setFresh(false); setReadErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); } return false; }
    if (viewer.value?.id !== ready.viewerId) { hidePrivate(ADMISSION_REVIEW_UI_COPY.changedViewer, true); return false; }
    return true;
  }, [client, ready, hidePrivate, setReadErrorMessage]);

  /** @param result - Safe owned failure; denial clears private data. @param options - Action feedback remains visible after a successful resource refresh. */
  const handleResourceFailure = useCallback((result: { code: string; message: string }, options?: { readonly action: boolean }) => {
    if (result.code === ADMISSION_ERROR_CODE.authenticationRequired || result.code === ADMISSION_ERROR_CODE.permissionDenied) hidePrivate(result.message);
    else { setFresh(false); if (options?.action) setErrorMessage(result.message); else setReadErrorMessage(result.message); }
  }, [hidePrivate, setErrorMessage, setReadErrorMessage]);

  /** Applies only minimal confirmed resource changes; older replay cannot replace newer reviewer data. */
  const applyTransitions = useCallback((results: readonly AdmissionTransitionResult[]) => {
    if (!results.length) return;
    const transitions = new Map(results.map((result) => [result.admissionRequestId, result]));
    visibleReadRevision.current += 1;
    publishItems(currentItems.current.flatMap((request) => {
      const result = transitions.get(request.id);
      if (!result) return [request];
      const next = applyAdmissionReviewTransition(request, result);
      return next === request || matchesAdmissionReviewTransitionSelection(next, appliedFilters) ? [next] : [];
    }));
    setSelected((current) => current && transitions.has(current.id) ? applyAdmissionReviewTransition(current, transitions.get(current.id)!) : current);
    if (currentSelected.current && transitions.has(currentSelected.current.id)) currentSelected.current = applyAdmissionReviewTransition(currentSelected.current, transitions.get(currentSelected.current.id)!);
  }, [appliedFilters, publishItems]);

  /** Refreshes the already loaded window without clearing selection, drafts or confirmation for equal data. */
  const refreshVisibleReview = useCallback(async (signal: AbortSignal): Promise<AdmissionNotificationRefreshOutcome> => {
    if (!ready || busy.current || pending.current) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    const revision = visibleReadRevision.current, selectedId = currentSelected.current?.id;
    const current = () => !signal.aborted && revision === visibleReadRevision.current && !busy.current && !pending.current && currentSelected.current?.id === selectedId;
    try {
      if (!await checkViewer(signal, true)) { if (!signal.aborted) setFresh(false); return signal.aborted ? NOTIFICATION_REFRESH_OUTCOME.skipped : NOTIFICATION_REFRESH_OUTCOME.failed; }
      const snapshot = await readVisibleAdmissionReviewSnapshot({ client, slug: ready.slug, filters: appliedFilters, pages: loadedPageCount.current, selectedId, signal, isCurrent: current });
      if (!current() || snapshot.status === "aborted") return NOTIFICATION_REFRESH_OUTCOME.skipped;
      if (snapshot.status === "failed") {
        if (snapshot.code === ADMISSION_ERROR_CODE.authenticationRequired || snapshot.code === ADMISSION_ERROR_CODE.permissionDenied) handleResourceFailure(snapshot);
        else setFresh(false);
        return NOTIFICATION_REFRESH_OUTCOME.failed;
      }
      if (!await checkViewer(signal, true)) { if (!signal.aborted) setFresh(false); return signal.aborted ? NOTIFICATION_REFRESH_OUTCOME.skipped : NOTIFICATION_REFRESH_OUTCOME.failed; }
      if (!current()) return NOTIFICATION_REFRESH_OUTCOME.skipped;
      publishItems(snapshot.value.items);
      setCursor(snapshot.value.nextCursor);
      if (JSON.stringify(currentSelected.current) !== JSON.stringify(snapshot.value.selected)) { setSelected(snapshot.value.selected); currentSelected.current = snapshot.value.selected; setConfirmed(false); }
      setFresh(true); clearReadError();
      return NOTIFICATION_REFRESH_OUTCOME.refreshed;
    } catch {
      if (!current()) return NOTIFICATION_REFRESH_OUTCOME.skipped;
      setFresh(false); return NOTIFICATION_REFRESH_OUTCOME.failed;
    }
  }, [ready, client, appliedFilters, checkViewer, handleResourceFailure, clearReadError, publishItems]);
  const { refreshUnavailable: reviewRefreshUnavailable, clearRefreshFailure } = useAdmissionNotificationRefresh({ enabled: Boolean(ready && privateVisible && phase !== ADMISSION_REVIEW_PHASE.changedViewer && !navigating), paused: phase !== ADMISSION_REVIEW_PHASE.idle, scopeKey: ready ? `${ready.viewerId}:${ready.slug}` : "", refresh: refreshVisibleReview });

  /** Reads the original operation first, then current inbox/detail; absence never manufactures started work. */
  const readCurrent = useCallback(async (signal: AbortSignal, selectionId?: string, append = false, after?: string | null, useServerSnapshot = false) => {
    if (!ready) return;
    setFresh(false); setPhase(ADMISSION_REVIEW_PHASE.reading); setErrorMessage(null); setCanRetry(false);
    try {
      if (!await checkViewer(signal)) return;
      if (!loaded.current) {
        pending.current = readAdmissionReviewIntent(ready.viewerId, ready.slug); loaded.current = true;
        setBatchPending(Boolean(pending.current && isAdmissionBatchReviewIntent(pending.current)));
        if (pending.current) { setInternalReason(pending.current.input.internalReason); setExternalMessage(pending.current.input.externalMessage ?? ""); }
      }
      const original = pending.current;
      if (original) {
        if (isAdmissionBatchReviewIntent(original)) { setBatchManifest(original.selection); selectionId = undefined; }
        const recovery = await client.operation(ready.slug, original.input.operationId, signal);
        if (signal.aborted || recovery.status === "aborted") return;
        if (!await checkViewer(signal)) return;
        if (recovery.status === "ready") {
          const operation = recovery.value;
          if (isAdmissionBatchReviewIntent(original)) {
            const projected = projectAdmissionBatchReviewRecovery(original, operation);
            if (!projected) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return; }
            setBatchResult(projected);
            // The authorized original remains visible if the separate inbox read fails; freshness still blocks new decisions.
            setPrivateVisible(true);
            if (projected.state === OPERATION_STATE.completed) {
              applyTransitions(getAdmissionBatchReviewTransitions(projected)); batchActions.clear(); setStatusMessage(null); invalidateAdmissionNotificationRefresh();
              writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null; setBatchPending(false);
            }
          } else {
            if (operation.type !== ADMISSION_OPERATION_TYPE.decide || operation.operationId !== original.input.operationId.toLowerCase()) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return; }
            if (operation.state === OPERATION_STATE.completed) {
              if ("code" in operation.result) {
                if (operation.result.admissionRequestId !== original.requestId.toLowerCase()) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return; }
                writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null;
                setStatusMessage(""); setErrorMessage(ADMISSION_ERROR_MESSAGE[operation.result.code]);
                selectionId = original.requestId;
              } else {
                const expected = original.input.decision === ADMISSION_DECISION.approve ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.rejected;
                if (operation.result.admissionRequestId !== original.requestId.toLowerCase() || operation.result.status !== expected || operation.result.version !== original.input.expectedVersion + 1) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return; }
                writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null; applyTransitions([operation.result]); setStatusMessage(ADMISSION_REVIEW_UI_COPY.recovered); invalidateAdmissionNotificationRefresh();
              }
            }
          }
        } else if (recovery.code === ADMISSION_ERROR_CODE.resourceUnavailable) setCanRetry(true);
        else { handleResourceFailure(recovery); return; }
        selectionId = isAdmissionBatchReviewIntent(original) ? undefined : original.requestId;
      }
      const fromSnapshot = useServerSnapshot && !original && (!selectionId || selectionId === ready.selected?.id);
      const page = fromSnapshot ? { status: "ready" as const, value: ready.page } : await client.reviewList(ready.slug, append ? after ?? null : null, signal, ready.filters ?? DEFAULT_ADMISSION_REVIEW_SELECTION);
      if (signal.aborted || page.status === "aborted") return;
      if (page.status === "failed") { handleResourceFailure(page); return; }
      const detail = fromSnapshot ? ready.selected ? { status: "ready" as const, value: ready.selected } : null : selectionId ? await client.reviewDetail(ready.slug, selectionId, signal) : null;
      if (signal.aborted || detail?.status === "aborted") return;
      if (detail?.status === "failed") { handleResourceFailure(detail); return; }
      if (!await checkViewer(signal) || signal.aborted || readController.current?.signal !== signal) return;
      const existing = new Set(currentItems.current.map((item) => item.id));
      publishItems(append ? [...currentItems.current, ...page.value.items.filter((item) => !existing.has(item.id))] : page.value.items);
      loadedPageCount.current = append ? loadedPageCount.current + 1 : 1;
      setCursor(page.value.nextCursor);
      const selectedValue = detail?.status === "ready" ? detail.value : null;
      setSelected(selectedValue); currentSelected.current = selectedValue; setPrivateVisible(true); setFresh(true); clearReadError(); clearRefreshFailure();
    } catch { if (!signal.aborted) { setFresh(false); setErrorMessage(ADMISSION_REVIEW_UI_COPY.storageFailed); } }
    finally { if (!signal.aborted) setPhase((current) => current === ADMISSION_REVIEW_PHASE.changedViewer ? current : pending.current ? ADMISSION_REVIEW_PHASE.uncertain : ADMISSION_REVIEW_PHASE.idle); }
  }, [ready, client, checkViewer, handleResourceFailure, applyTransitions, setErrorMessage, clearReadError, clearRefreshFailure, batchActions, publishItems]);

  /** Explicit interactions share one cancellable read slot; a concurrent write cannot be replaced by a read. */
  const launchRead = useCallback((selectionId?: string, append = false, after?: string | null) => {
    if (busy.current) return;
    visibleReadRevision.current += 1;
    if (selectionId && selectionId !== currentSelected.current?.id) setStatusMessage(null);
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    setConfirmed(false);
    batchActions.resetConfirmation();
    void readCurrent(controller.signal, selectionId, append, after);
  }, [readCurrent, batchActions]);

  useEffect(() => {
    visibleReadRevision.current += 1;
    const controller = new AbortController(); readController.current = controller;
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      const snapshotAt = ready?.renderedAt ?? null, useServerSnapshot = snapshotAt !== consumedSnapshotAt.current;
      consumedSnapshotAt.current = snapshotAt;
      loaded.current = false; loadedPageCount.current = 1; setPrivateVisible(false); setConfirmed(false);
      return readCurrent(controller.signal, currentSelected.current?.id, false, null, useServerSnapshot);
    });
    /** Restored Activity/bfcache must reload the original scoped intent before enabling another decision. */
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      writeController.current?.abort(); busy.current = false;
      loaded.current = false; setPrivateVisible(false); setFresh(false); launchRead(currentSelected.current?.id);
    };
    window.addEventListener("pageshow", restored);
    return () => { controller.abort(); readController.current?.abort(); writeController.current?.abort(); loaded.current = false; busy.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent, launchRead, ready]);

  /**
   * Persists the immutable original intention before sending; uncertain/aborted writes reconcile before any retry.
   * @param intent - Exact individual or batch original.
   * @param action - Control the reviewer pressed, shown as in progress while the write lasts.
   */
  const send = async (intent: AdmissionStoredReviewIntent, action: AdmissionReviewPendingAction) => {
    if (!ready || busy.current) return;
    if (!isAdmissionBatchReviewIntent(intent)) captureActionFocus();
    busy.current = true; visibleReadRevision.current += 1; readController.current?.abort();
    const controller = new AbortController(); writeController.current = controller;
    setWritingAction(action); setPhase(ADMISSION_REVIEW_PHASE.writing); setFresh(false); setErrorMessage(null); setStatusMessage(null); setConfirmed(false);
    batchActions.resetConfirmation();
    try {
      if (!await checkViewer(controller.signal)) return;
      writeAdmissionReviewIntent(ready.viewerId, ready.slug, intent); pending.current = intent;
      setBatchPending(isAdmissionBatchReviewIntent(intent));
      if (isAdmissionBatchReviewIntent(intent)) {
        setBatchManifest(intent.selection);
        const result = await client.decideBatch(ready.slug, createAdmissionBatchDecisionInput(intent), controller.signal);
        if (controller.signal.aborted || result.status === "aborted" || !await checkViewer(controller.signal)) return;
        if (result.status === "failed") {
          handleResourceFailure(result, { action: true });
          if (!result.uncertain) { writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null; setBatchPending(false); }
          return;
        }
        setBatchResult(result.value);
        if (result.value.state === OPERATION_STATE.completed) {
          applyTransitions(getAdmissionBatchReviewTransitions(result.value)); batchActions.clear(); setStatusMessage(null); invalidateAdmissionNotificationRefresh();
          writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null; setBatchPending(false);
        }
        return;
      }
      const result = await client.decide(ready.slug, intent.requestId, intent.input, controller.signal);
      if (controller.signal.aborted || result.status === "aborted") return;
      if (!await checkViewer(controller.signal)) return;
      if (result.status === "failed") {
        handleResourceFailure(result, { action: true });
        if (!result.uncertain) { writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null; }
        return;
      }
      if ("state" in result.value) return;
      writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null;
      applyTransitions([result.value]); setStatusMessage(ADMISSION_REVIEW_UI_COPY.complete); invalidateAdmissionNotificationRefresh();
    } catch { if (!controller.signal.aborted) setErrorMessage(ADMISSION_REVIEW_UI_COPY.storageFailed); }
    finally {
      if (writeController.current === controller) { busy.current = false; if (!controller.signal.aborted) finishActionFocus(); }
      if (!controller.signal.aborted) { setPhase((current) => current === ADMISSION_REVIEW_PHASE.changedViewer ? current : pending.current ? ADMISSION_REVIEW_PHASE.uncertain : ADMISSION_REVIEW_PHASE.idle); setCanRetry(false); }
    }
  };

  /**
   * Navigates after validation; the server entrypoint rechecks authority and owns the next initial read.
   * @param filters - The validated selection for the next server snapshot.
   * @param resetDraft - Whether explicit reset must discard unapplied edits even on the same route.
   * @returns Nothing; blocked navigation preserves the current draft and reports its cause.
   */
  const navigateFilters = (filters: AdmissionReviewSelection, resetDraft = false) => {
    if (!ready || busy.current || pending.current || !fresh || phase !== ADMISSION_REVIEW_PHASE.idle || navigating) { setFilterError(ADMISSION_REVIEW_FILTER_COPY.blocked); return; }
    if (resetDraft) { setFilterDraft(createAdmissionReviewFilterDraft(filters)); editedDateFilters.current.clear(); }
    readController.current?.abort(); setConfirmed(false); setErrorMessage(null); setStatusMessage(null); setFilterError(null); batchActions.clear(); setBatchManifest([]); setBatchResult(null);
    startNavigation(() => router.push(buildAdmissionReviewSelectionRoute(ready.slug, filters)));
  };

  /** Discards only local, resolved selection feedback; an unresolved original must remain recoverable. */
  const clearBatch = () => { if (pending.current || busy.current) return; batchActions.clear(); setBatchManifest([]); setBatchResult(null); setConfirmed(false); setInternalReason(""); setExternalMessage(""); setErrorMessage(null); setStatusMessage(null); };
  const retryOriginal = () => { const original = pending.current; if (original && canRetry && fresh && (isAdmissionBatchReviewIntent(original) ? batchActions.isConfirmedFor(original.selection) : confirmed)) void send(original, ADMISSION_REVIEW_PENDING_ACTION.retry); };
  const batchAvailability = useMemo(() => {
    const visible = new Map(items.map((item) => [item.id, item]));
    return { approve: batchSelection.some((selected) => visible.get(selected.requestId)?.eligibleActions.includes(ADMISSION_DECISION.approve)), reject: batchSelection.some((selected) => visible.get(selected.requestId)?.eligibleActions.includes(ADMISSION_DECISION.reject)),
      /** One selected exception makes the shared reason necessary for approving the batch. */
      approveRequiresReason: batchSelection.some((selected) => visible.get(selected.requestId)?.restrictions.requiresExceptionReason === true) };
  }, [items, batchSelection]);

  if (!ready) return <AdmissionRouteError message={initialState.kind === "unavailable" ? initialState.message : ADMISSION_REVIEW_UI_COPY.readFailed} reset={() => window.location.reload()} />;
  if (phase === ADMISSION_REVIEW_PHASE.changedViewer) return <AdmissionRouteError message={ADMISSION_REVIEW_UI_COPY.changedViewer} reset={() => window.location.reload()} />;
  if (!privateVisible && phase !== ADMISSION_REVIEW_PHASE.reading) return <AdmissionRouteError message={errorMessage ?? ADMISSION_REVIEW_UI_COPY.readFailed} reset={() => launchRead(currentSelected.current?.id)} />;
  const uncertain = phase === ADMISSION_REVIEW_PHASE.uncertain;
  const pendingAction = phase === ADMISSION_REVIEW_PHASE.writing ? writingAction : null;
  const formDisabled = !fresh || phase === ADMISSION_REVIEW_PHASE.reading || phase === ADMISSION_REVIEW_PHASE.writing || navigating;
  const batchContext = batchPending || batchSelection.length > 0 || batchResult !== null;
  const reviewError = errorMessage ?? (reviewRefreshUnavailable ? ADMISSION_REVIEW_UI_COPY.readFailed : null);
  return <AdmissionReview statusRef={decisionStatusRef} filters={privateVisible ? <AdmissionReviewFilters draft={filterDraft} disabled={formDisabled || uncertain} errorMessage={filterError} onChange={(field, value) => { if (field === "submittedFrom" || field === "submittedUntil") editedDateFilters.current.add(field); setFilterDraft((current) => ({ ...current, [field]: value })); setFilterError(null); }} onApply={() => { const parsed = parseAdmissionReviewFilterDraft(ready.slug, filterDraft, appliedFilters.limit, { original: appliedFilters, editedDates: editedDateFilters.current }); if (!parsed.ok) { setFilterError(ADMISSION_REVIEW_FILTER_COPY.invalid); return; } navigateFilters(parsed.filters); }} onReset={() => navigateFilters(DEFAULT_ADMISSION_REVIEW_SELECTION, true)} /> : undefined}
    recovery={batchPending ? null : undefined}
    batchSelection={{ ids: new Set(batchSelection.map((item) => item.requestId)), disabled: formDisabled || uncertain, onToggle: (id, checked) => {
      if (formDisabled || uncertain || busy.current || pending.current || currentSelected.current) return;
      const item = currentItems.current.find((item) => item.id === id);
      if (!item || item.status !== ADMISSION_REQUEST_STATUS.pending || !item.eligibleActions.length) { setErrorMessage(ADMISSION_BATCH_REVIEW_COPY.invalid); return; }
      if (!batchActions.toggle(item, checked)) { setErrorMessage(ADMISSION_BATCH_REVIEW_COPY.limitReached); return; }
      setBatchResult(null); setBatchManifest([]); setConfirmed(false); setErrorMessage(null); setStatusMessage(null);
    } }}
    batch={privateVisible && batchContext ? <AdmissionBatchReview selection={batchSelection} manifest={batchManifest} result={batchResult} pending={batchPending} pendingAction={pendingAction} canRetry={canRetry} disabled={formDisabled} busy={phase === ADMISSION_REVIEW_PHASE.reading || phase === ADMISSION_REVIEW_PHASE.writing || navigating} internalReason={internalReason} externalMessage={externalMessage} confirmed={batchConfirmed} errorMessage={reviewError} allowApprove={batchAvailability.approve} allowReject={batchAvailability.reject} approveRequiresReason={batchAvailability.approveRequiresReason} onInternalReason={(value) => { if (pending.current || busy.current) return; setInternalReason(value); setErrorMessage(null); }} onExternalMessage={(value) => { if (pending.current || busy.current) return; setExternalMessage(value); setErrorMessage(null); }} onConfirm={(value) => { const original = pending.current; batchActions.confirm(value, original && isAdmissionBatchReviewIntent(original) ? original.selection : undefined); setErrorMessage(null); }} onClear={clearBatch} onRetry={retryOriginal} onDecision={(decision) => {
      const selection = batchActions.getSelection();
      if (formDisabled || !batchActions.isConfirmedFor(selection) || pending.current || busy.current || !selection.length || !selection.some((selected) => currentItems.current.some((item) => item.id === selected.requestId && item.eligibleActions.includes(decision))) || selection.some((selected) => !currentItems.current.some((item) => item.id === selected.requestId && item.version === selected.expectedVersion && item.status === ADMISSION_REQUEST_STATUS.pending))) { setErrorMessage(ADMISSION_BATCH_REVIEW_COPY.invalid); return; }
      const parsed = admissionBatchReviewIntentSchema.safeParse({ kind: ADMISSION_BATCH_DECISION_OPERATION, selection, input: { operationId: newAdmissionOperationId(), confirmed: true, decision, internalReason, externalMessage } });
      if (!parsed.success) { setErrorMessage(ADMISSION_BATCH_REVIEW_COPY.invalid); return; }
      void send(parsed.data, decision);
    }} /> : undefined}
    historyHref={privateVisible && selected ? buildAdmissionReviewHistoryRoute(ready.slug, selected.id, appliedFilters) : undefined}
    items={privateVisible ? items : []} selected={privateVisible ? selected : null} hasMore={privateVisible && cursor !== null} busy={phase === ADMISSION_REVIEW_PHASE.reading || phase === ADMISSION_REVIEW_PHASE.writing || navigating} pendingAction={pendingAction} disabled={formDisabled} confirmed={confirmed} internalReason={internalReason} externalMessage={externalMessage} errorMessage={batchContext ? null : reviewError} statusMessage={privateVisible ? statusMessage : ADMISSION_REVIEW_UI_COPY.reading} uncertain={uncertain} canRetry={canRetry}
    onSelect={(id) => { if (pending.current || busy.current) return; clearBatch(); setInternalReason(""); setExternalMessage(""); launchRead(id); }} onClose={() => { if (pending.current || busy.current) return; currentSelected.current = null; setSelected(null); setConfirmed(false); setInternalReason(""); setExternalMessage(""); setStatusMessage(null); }}
    onRead={() => launchRead(currentSelected.current?.id)} onLoadMore={() => launchRead(undefined, true, cursor)} onConfirm={(value) => { setConfirmed(value); setErrorMessage(null); }}
    onInternalReason={(value) => { setInternalReason(value); setErrorMessage(null); }} onExternalMessage={(value) => { setExternalMessage(value); setErrorMessage(null); }}
    onDecision={(decision) => {
      if (!selected || formDisabled || !confirmed || pending.current || !selected.eligibleActions.includes(decision)) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.invalid); return; }
      const parsed = admissionReviewIntentSchema.safeParse({ requestId: selected.id, input: { operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: selected.version, decision, internalReason, externalMessage } });
      if (!parsed.success) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.invalid); return; }
      void send(parsed.data, decision);
    }} onRetry={retryOriginal} />;
}
