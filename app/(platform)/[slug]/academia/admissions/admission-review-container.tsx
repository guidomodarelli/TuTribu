"use client";
/** Owns native viewer checks, reviewer reads and original decision reconciliation. @module admission-review-container */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ComponentProps } from "react";
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
import { admissionReviewIntentSchema, admissionBatchReviewIntentSchema, type AdmissionBatchReviewSelection, type AdmissionStoredReviewIntent } from "@/lib/academy-admissions/admission-review-intent";
import { isAdmissionBatchReviewIntent } from "@/src/modules/academy-admissions/application/results/admission-review-intent";
import { ADMISSION_BATCH_REVIEW_COPY } from "@/src/modules/academy-admissions/constants/admission-batch-review-ui";
import { ADMISSION_BATCH_DECISION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-batch-decision";
import { ADMISSION_REVIEW_UI_COPY, ADMISSION_REVIEW_PHASE, ADMISSION_REVIEW_PENDING_ACTION, type AdmissionReviewPendingAction } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { ADMISSION_REVIEW_FILTER_COPY } from "@/src/modules/academy-admissions/constants/admission-review-filters";
import { createAdmissionReviewFilterDraft, parseAdmissionReviewFilterDraft, buildAdmissionReviewSelectionRoute, type AdmissionReviewDateFilter } from "@/lib/academy-admissions/admission-review-filters";
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";
import { buildAdmissionReviewHistoryRoute } from "@/lib/academy-admissions/admission-review-history-routes";
import { useAdmissionNotificationRefresh } from "@/hooks/use-admission-notification-refresh";
import { useAdmissionViewFeedback } from "@/hooks/use-admission-view-feedback";
import { useReplacedActionFocus } from "@/hooks/use-replaced-action-focus";
import { useAdmissionReviewBatchSelection } from "@/hooks/use-admission-review-batch-selection";
import { NOTIFICATION_REFRESH_OUTCOME } from "@/src/modules/notifications/constants/admission-notification-refresh";
import type { AdmissionNotificationRefreshOutcome } from "@/src/modules/notifications/application/results/notification-refresh-state";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { applyReviewTransitions, batchAvailabilityFor, closeReviewSelection, hideReviewPrivate, isBatchDecisionValid, publishReviewItems, readReviewCurrent, refreshVisibleReviewWindow, sendReviewIntent, startReviewLifecycle, startReviewRead, type ReviewControls, type ReviewPhase, type ReviewReader, type ReviewReady, type ReviewSession } from "./admission-review-workflow";

/** Public props contain the server snapshot and an optional own transport port for behavioral tests. */
type ReviewContainerProps = { initialState: AdmissionReviewPageState; client?: AdmissionReviewBrowserClient };

/** @param ready - Server snapshot, when readable. @returns Every state of the inbox and the stable controls of its reads and writes. */
function useReviewState(ready: ReviewReady | null) {
  const [items, setItems] = useState<AdmissionReviewDto[]>(ready?.page.items ?? []), [cursor, setCursor] = useState(ready?.page.nextCursor ?? null);
  const [selected, setSelected] = useState<AdmissionReviewDto | null>(ready?.selected ?? null);
  const [phase, setPhase] = useState<ReviewPhase>(ADMISSION_REVIEW_PHASE.idle);
  /** The write the reviewer pressed; it only counts while the writing phase lasts. */
  const [writingAction, setWritingAction] = useState<AdmissionReviewPendingAction | null>(null);
  const [fresh, setFresh] = useState(false), [confirmed, setConfirmed] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [privateVisible, setPrivateVisible] = useState(true);
  const [internalReason, setInternalReason] = useState(""), [externalMessage, setExternalMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [batchManifest, setBatchManifest] = useState<AdmissionBatchReviewSelection[]>([]), [batchPending, setBatchPending] = useState(false);
  const [batchResult, setBatchResult] = useState<AdmissionBatchResultDto | null>(null);
  const [platformRequirement, setPlatformRequirementState] = useState<PlatformSecurityRequirement | null>(ready?.page.platformRequirement ?? null);
  const currentPlatformRequirement = useRef<PlatformSecurityRequirement | null>(ready?.page.platformRequirement ?? null);
  const pending = useRef<AdmissionStoredReviewIntent | null>(null), currentSelected = useRef(selected), loaded = useRef(false), busy = useRef(false);
  const currentItems = useRef<AdmissionReviewDto[]>(ready?.page.items ?? []);
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);
  const consumedSnapshotAt = useRef<string | null>(null);
  const visibleReadRevision = useRef(0), loadedPageCount = useRef(1);
  /** Setters and refs never change identity, so one stable bundle serves every read and write. */
  const controls = useMemo<ReviewControls>(() => ({ setItems, setCursor, setSelected, setPhase, setWritingAction, setFresh, setConfirmed, setCanRetry, setPrivateVisible, setInternalReason, setExternalMessage, setStatusMessage, setBatchManifest, setBatchPending, setBatchResult,
    setPlatformRequirement: (value: PlatformSecurityRequirement | null) => { currentPlatformRequirement.current = value; setPlatformRequirementState(value); }, platformRequirement: currentPlatformRequirement, pending, currentSelected, loaded, busy, currentItems, readController, writeController, consumedSnapshotAt, visibleReadRevision, loadedPageCount }), []);
  return { items, cursor, selected, phase, writingAction, fresh, confirmed, canRetry, privateVisible, internalReason, externalMessage, statusMessage, batchManifest, batchPending, batchResult, platformRequirement, controls };
}

/** Inputs of the shared read and write callbacks. */
type ReviewSessionInput = { ready: ReviewReady | null; client: AdmissionReviewBrowserClient; controls: ReviewControls; appliedFilters: AdmissionReviewSelection; batchActions: ReturnType<typeof useAdmissionReviewBatchSelection>["actions"]; feedback: ReturnType<typeof useAdmissionViewFeedback> };

/** @param input - Snapshot, transport, controls, filters, batch actions and page feedback. @returns The memoized session shared by reads and writes, or null without a readable snapshot. */
function useReviewSession({ ready, client, controls, appliedFilters, batchActions, feedback }: ReviewSessionInput): ReviewSession | null {
  const { setErrorMessage, setReadErrorMessage, clearReadError } = feedback;
  /** Publishes one current data window and invalidates only selections that no longer name its original visible versions. */
  const publishItems = useCallback((next: AdmissionReviewDto[]) => publishReviewItems(controls, batchActions, next), [controls, batchActions]);
  /** @param signal - Original current read or write. @param quiet - Keeps background transport failures separate from existing form feedback. @returns Current native identity without inheriting another account's state. */
  const checkViewer = useCallback(async (signal: AbortSignal, quiet = false): Promise<boolean> => {
    if (!ready || signal.aborted) return false;
    const viewer = await client.viewer(signal);
    if (signal.aborted || viewer.status === "aborted") return false;
    if (viewer.status === "failed") { if (!quiet) { controls.setPrivateVisible(false); controls.setFresh(false); setReadErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); } return false; }
    if (viewer.value?.id !== ready.viewerId) { hideReviewPrivate({ controls, batchActions, setErrorMessage }, ADMISSION_REVIEW_UI_COPY.changedViewer, true); return false; }
    return true;
  }, [client, ready, controls, batchActions, setErrorMessage, setReadErrorMessage]);
  /** @param result - Safe owned failure; denial clears private data. @param options - Action feedback remains visible after a successful resource refresh. */
  const handleResourceFailure = useCallback((result: { code: string; message: string }, options?: { readonly action: boolean }) => {
    if (result.code === ADMISSION_ERROR_CODE.authenticationRequired || result.code === ADMISSION_ERROR_CODE.permissionDenied) hideReviewPrivate({ controls, batchActions, setErrorMessage }, result.message);
    else { controls.setFresh(false); if (options?.action) setErrorMessage(result.message); else setReadErrorMessage(result.message); }
  }, [controls, batchActions, setErrorMessage, setReadErrorMessage]);
  /** Applies only minimal confirmed resource changes; older replay cannot replace newer reviewer data. */
  const applyTransitions = useCallback((results: readonly AdmissionTransitionResult[]) => applyReviewTransitions(controls, appliedFilters, publishItems, results), [controls, appliedFilters, publishItems]);
  return useMemo(() => ready ? { ready, client, controls, appliedFilters, batchActions, checkViewer, handleResourceFailure, applyTransitions, publishItems, setErrorMessage, clearReadError } : null,
    [ready, client, controls, appliedFilters, batchActions, checkViewer, handleResourceFailure, applyTransitions, publishItems, setErrorMessage, clearReadError]);
}

/** Render state of the inbox the presenter and its controls derive from. */
type ReviewView = ReturnType<typeof useReviewState>;

/** @param view - Inbox state. @param facts - Pending filter navigation, selected batch rows, page feedback and whether the background refresh failed. @returns The derived flags of the current render. */
function reviewFlags(view: ReviewView, { navigating, batchCount, errorMessage, refreshUnavailable }: { navigating: boolean; batchCount: number; errorMessage: string | null; refreshUnavailable: boolean }) {
  const reading = view.phase === ADMISSION_REVIEW_PHASE.reading || view.phase === ADMISSION_REVIEW_PHASE.writing || navigating;
  return {
    uncertain: view.phase === ADMISSION_REVIEW_PHASE.uncertain,
    pendingAction: view.phase === ADMISSION_REVIEW_PHASE.writing ? view.writingAction : null,
    reading, formDisabled: !view.fresh || reading,
    batchContext: view.batchPending || batchCount > 0 || view.batchResult !== null,
    reviewError: errorMessage ?? (refreshUnavailable ? ADMISSION_REVIEW_UI_COPY.readFailed : null),
  };
}

/** @param initialState - Server state. @param view - Inbox state. @param errorMessage - Page feedback. @param retry - Explicit reread of the open request. @returns The route error that replaces the inbox, or null when the inbox may render. */
function reviewRouteError(initialState: AdmissionReviewPageState, view: ReviewView, errorMessage: string | null, retry: () => void) {
  if (initialState.kind !== "ready") return <AdmissionRouteError embedded message={initialState.message} retry={() => window.location.reload()} />;
  if (view.phase === ADMISSION_REVIEW_PHASE.changedViewer) return <AdmissionRouteError embedded message={ADMISSION_REVIEW_UI_COPY.changedViewer} retry={() => window.location.reload()} />;
  if (!view.privateVisible && view.phase !== ADMISSION_REVIEW_PHASE.reading) return <AdmissionRouteError message={errorMessage ?? ADMISSION_REVIEW_UI_COPY.readFailed} retry={retry} />;
  return null;
}

/** @param view - Inbox state. @param slug - Route scope. @param filters - Current inbox filters. @returns The private presenter facts, hidden while the private view is withheld. */
function visibleReviewProps(view: ReviewView, slug: string, filters: AdmissionReviewSelection) {
  if (!view.privateVisible) return { items: [], selected: null, hasMore: false, statusMessage: ADMISSION_REVIEW_UI_COPY.reading, historyHref: undefined, platformRequirement: null };
  return { items: view.items, selected: view.selected, hasMore: view.cursor !== null, statusMessage: view.statusMessage, historyHref: view.selected ? buildAdmissionReviewHistoryRoute(slug, view.selected.id, filters) : undefined, platformRequirement: view.platformRequirement };
}

/** Everything the reviewer interactions read; it grants no authority. */
type ReviewInteractionDeps = {
  view: ReviewView; slug: string; batchActions: BatchActions; setErrorMessage: (message: string | null) => void; flags: ReturnType<typeof reviewFlags>;
  send: (intent: AdmissionStoredReviewIntent, action: AdmissionReviewPendingAction) => Promise<void>; launchRead: (selectionId?: string, append?: boolean, after?: string | null) => void;
};
type BatchActions = ReturnType<typeof useAdmissionReviewBatchSelection>["actions"];

/** @param deps - Inbox state, scope, batch actions, feedback, flags, write and read entry points. @returns The reviewer interactions; writes stay closed while an original is unresolved or another write runs. */
function reviewInteractions({ view, batchActions, setErrorMessage, flags, send, launchRead }: ReviewInteractionDeps) {
  const { controls } = view;
  /** @returns Whether an unresolved original or another write keeps new interactions closed. */
  const locked = () => Boolean(controls.pending.current) || controls.busy.current;
  /** Discards only local, resolved selection feedback; an unresolved original must remain recoverable. */
  const clearBatch = () => { if (locked()) return; batchActions.clear(); controls.setBatchManifest([]); controls.setBatchResult(null); controls.setConfirmed(false); controls.setInternalReason(""); controls.setExternalMessage(""); setErrorMessage(null); controls.setStatusMessage(null); };
  /** @returns Nothing after resending the stored original once it is confirmed again on a fresh read. */
  const retryOriginal = () => { const original = controls.pending.current; if (original && view.canRetry && view.fresh && (isAdmissionBatchReviewIntent(original) ? batchActions.isConfirmedFor(original.selection) : view.confirmed)) void send(original, ADMISSION_REVIEW_PENDING_ACTION.retry); };
  /** @param apply - Batch reason edit. @returns Nothing; an unresolved original keeps its reasons. */
  const editBatchReason = (apply: () => void) => { if (locked()) return; apply(); setErrorMessage(null); };
  /** @param id - Toggled row. @param checked - Whether it joins the batch. @returns Nothing after changing the selection of an eligible pending row. */
  const toggleBatchRow = (id: string, checked: boolean) => {
    if (flags.formDisabled || flags.uncertain || locked() || controls.currentSelected.current) return;
    const item = controls.currentItems.current.find((row) => row.id === id);
    if (item?.status !== ADMISSION_REQUEST_STATUS.pending || !item.eligibleActions.length) { setErrorMessage(ADMISSION_BATCH_REVIEW_COPY.invalid); return; }
    if (!batchActions.toggle(item, checked)) { setErrorMessage(ADMISSION_BATCH_REVIEW_COPY.limitReached); return; }
    controls.setBatchResult(null); controls.setBatchManifest([]); controls.setConfirmed(false); setErrorMessage(null); controls.setStatusMessage(null);
  };
  /** @param decision - Batch decision. @returns Nothing after sending the confirmed manifest once. */
  const decideBatch = (decision: AdmissionReviewDto["eligibleActions"][number]) => {
    const selection = batchActions.getSelection();
    if (flags.formDisabled || !batchActions.isConfirmedFor(selection) || locked() || !isBatchDecisionValid(controls.currentItems.current, selection, decision)) { setErrorMessage(ADMISSION_BATCH_REVIEW_COPY.invalid); return; }
    const parsed = admissionBatchReviewIntentSchema.safeParse({ kind: ADMISSION_BATCH_DECISION_OPERATION, selection, input: { operationId: newAdmissionOperationId(), confirmed: true, decision, internalReason: view.internalReason, externalMessage: view.externalMessage } });
    if (!parsed.success) { setErrorMessage(ADMISSION_BATCH_REVIEW_COPY.invalid); return; }
    void send(parsed.data, decision);
  };
  /** @param decision - Decision on the open request. @returns Nothing after sending it once. */
  const decideSingle = (decision: AdmissionReviewDto["eligibleActions"][number]) => {
    const { selected } = view;
    if (!selected || flags.formDisabled || !view.confirmed || controls.pending.current || !selected.eligibleActions.includes(decision)) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.invalid); return; }
    const parsed = admissionReviewIntentSchema.safeParse({ requestId: selected.id, input: { operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: selected.version, decision, internalReason: view.internalReason, externalMessage: view.externalMessage } });
    if (!parsed.success) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.invalid); return; }
    void send(parsed.data, decision);
  };
  /** @param value - Batch confirmation. @returns Nothing after confirming the current or the stored original selection. */
  const confirmBatch = (value: boolean) => { const original = controls.pending.current; batchActions.confirm(value, original && isAdmissionBatchReviewIntent(original) ? original.selection : undefined); setErrorMessage(null); };
  /** @param id - Request to open. @returns Nothing after opening it with empty reasons. */
  const select = (id: string) => { if (locked()) return; clearBatch(); controls.setInternalReason(""); controls.setExternalMessage(""); launchRead(id); };
  return { locked, clearBatch, retryOriginal, editBatchReason, toggleBatchRow, decideBatch, decideSingle, confirmBatch, select };
}

/** @param props - Guarded deterministic server state and own client adapter. @returns A single route owner; presenters receive callbacks only. */
export function AdmissionReviewContainer({ initialState, client = admissionApiClient }: ReviewContainerProps) {
  const ready = initialState.kind === "ready" ? initialState : null;
  const router = useRouter(), [navigating, startNavigation] = useTransition();
  const appliedFilters = ready?.filters ?? DEFAULT_ADMISSION_REVIEW_SELECTION;
  const [filterDraft, setFilterDraft] = useState(() => createAdmissionReviewFilterDraft(appliedFilters));
  const [filterError, setFilterError] = useState<string | null>(null);
  const editedDateFilters = useRef(new Set<AdmissionReviewDateFilter>());
  const view = useReviewState(ready), { selected, phase, fresh, confirmed, canRetry, privateVisible, internalReason, externalMessage, batchPending, batchResult, controls } = view;
  const feedback = useAdmissionViewFeedback(), { errorMessage, setErrorMessage } = feedback;
  const scopeKey = ready ? `${ready.viewerId}:${ready.slug}` : "";
  const { resultRef: decisionStatusRef, captureActionFocus, finishActionFocus } = useReplacedActionFocus({ scopeKey, resultKey: `${selected?.id ?? ""}:${selected?.status ?? ""}`, enabled: Boolean(ready && privateVisible && phase !== ADMISSION_REVIEW_PHASE.changedViewer) });
  const { selection: batchSelection, confirmed: batchConfirmed, actions: batchActions } = useAdmissionReviewBatchSelection();
  const session = useReviewSession({ ready, client, controls, appliedFilters, batchActions, feedback });
  /** Refreshes the already loaded window without clearing selection, drafts or confirmation for equal data. */
  const refreshVisibleReview = useCallback(async (signal: AbortSignal): Promise<AdmissionNotificationRefreshOutcome> => session ? refreshVisibleReviewWindow(session, signal) : NOTIFICATION_REFRESH_OUTCOME.skipped, [session]);
  const { refreshUnavailable, clearRefreshFailure } = useAdmissionNotificationRefresh({ enabled: Boolean(ready && privateVisible && phase !== ADMISSION_REVIEW_PHASE.changedViewer && !navigating), paused: phase !== ADMISSION_REVIEW_PHASE.idle, scopeKey, refresh: refreshVisibleReview });
  /** Reads the original operation first, then current inbox/detail; absence never manufactures started work. */
  const readCurrent = useCallback<ReviewReader>(async (signal, request) => { if (session) await readReviewCurrent(session, signal, request, clearRefreshFailure); }, [session, clearRefreshFailure]);
  /** Explicit interactions share one cancellable read slot; a concurrent write cannot be replaced by a read. */
  const launchRead = useCallback((selectionId?: string, append = false, after?: string | null) => startReviewRead(controls, batchActions, readCurrent, { selectionId, append, after }), [controls, batchActions, readCurrent]);
  useEffect(() => startReviewLifecycle(controls, ready?.renderedAt ?? null, readCurrent, launchRead), [readCurrent, launchRead, ready, controls]);
  const batchAvailability = useMemo(() => batchAvailabilityFor(view.items, batchSelection), [view.items, batchSelection]);
  const routeError = reviewRouteError(initialState, view, errorMessage, () => launchRead(controls.currentSelected.current?.id));
  if (routeError || !ready || !session) return routeError;
  const flags = reviewFlags(view, { navigating, batchCount: batchSelection.length, errorMessage, refreshUnavailable }), { uncertain, pendingAction, reading, formDisabled } = flags;
  /** @param intent - Exact individual or batch original. @param action - Control the reviewer pressed. @returns Nothing after the write settles. */
  const send = (intent: AdmissionStoredReviewIntent, action: AdmissionReviewPendingAction) => sendReviewIntent(session, { captureActionFocus, finishActionFocus }, intent, action);
  const act = reviewInteractions({ view, slug: ready.slug, batchActions, setErrorMessage, flags, send, launchRead });
  /**
   * Navigates after validation; the server entrypoint rechecks authority and owns the next initial read.
   * @param filters - The validated selection for the next server snapshot.
   * @param resetDraft - Whether explicit reset must discard unapplied edits even on the same route.
   * @returns Nothing; blocked navigation preserves the current draft and reports its cause.
   */
  const navigateFilters = (filters: AdmissionReviewSelection, resetDraft = false) => {
    if (act.locked() || !fresh || phase !== ADMISSION_REVIEW_PHASE.idle || navigating) { setFilterError(ADMISSION_REVIEW_FILTER_COPY.blocked); return; }
    if (resetDraft) { setFilterDraft(createAdmissionReviewFilterDraft(filters)); editedDateFilters.current.clear(); }
    controls.readController.current?.abort(); controls.setConfirmed(false); setErrorMessage(null); controls.setStatusMessage(null); setFilterError(null); batchActions.clear(); controls.setBatchManifest([]); controls.setBatchResult(null);
    startNavigation(() => router.push(buildAdmissionReviewSelectionRoute(ready.slug, filters)));
  };
  /** @returns Nothing after navigating to the parsed draft, or reporting an invalid one. */
  const applyFilters = () => { const parsed = parseAdmissionReviewFilterDraft(ready.slug, filterDraft, appliedFilters.limit, { original: appliedFilters, editedDates: editedDateFilters.current }); if (!parsed.ok) { setFilterError(ADMISSION_REVIEW_FILTER_COPY.invalid); return; } navigateFilters(parsed.filters); };
  /** @param field - Edited filter. @param value - New draft value. @returns Nothing after remembering edited dates and clearing the filter error. */
  const changeFilter: ComponentProps<typeof AdmissionReviewFilters>["onChange"] = (field, value) => { if (field === "submittedFrom" || field === "submittedUntil") editedDateFilters.current.add(field); setFilterDraft((current) => ({ ...current, [field]: value })); setFilterError(null); };
  return <AdmissionReview statusRef={decisionStatusRef} filters={privateVisible ? <AdmissionReviewFilters draft={filterDraft} disabled={formDisabled || uncertain} errorMessage={filterError} onChange={changeFilter} onApply={applyFilters} onReset={() => navigateFilters(DEFAULT_ADMISSION_REVIEW_SELECTION, true)} /> : undefined}
    recovery={batchPending ? null : undefined}
    batchSelection={{ ids: new Set(batchSelection.map((item) => item.requestId)), disabled: formDisabled || uncertain, onToggle: act.toggleBatchRow }}
    batch={privateVisible && flags.batchContext ? <AdmissionBatchReview selection={batchSelection} manifest={view.batchManifest} result={batchResult} pending={batchPending} pendingAction={pendingAction} canRetry={canRetry} disabled={formDisabled} busy={reading} internalReason={internalReason} externalMessage={externalMessage} confirmed={batchConfirmed} errorMessage={flags.reviewError} allowApprove={batchAvailability.approve} allowReject={batchAvailability.reject} approveRequiresReason={batchAvailability.approveRequiresReason} onInternalReason={(value) => act.editBatchReason(() => controls.setInternalReason(value))} onExternalMessage={(value) => act.editBatchReason(() => controls.setExternalMessage(value))} onConfirm={act.confirmBatch} onClear={act.clearBatch} onRetry={act.retryOriginal} onDecision={act.decideBatch} /> : undefined}
    {...visibleReviewProps(view, ready.slug, appliedFilters)} busy={reading} pendingAction={pendingAction} disabled={formDisabled} confirmed={confirmed} internalReason={internalReason} externalMessage={externalMessage} errorMessage={flags.batchContext ? null : flags.reviewError} uncertain={uncertain} canRetry={canRetry}
    onSelect={act.select} onClose={() => closeReviewSelection(controls)}
    onRead={() => launchRead(controls.currentSelected.current?.id)} onLoadMore={() => launchRead(undefined, true, view.cursor)} onConfirm={(value) => { controls.setConfirmed(value); setErrorMessage(null); }}
    onInternalReason={(value) => { controls.setInternalReason(value); setErrorMessage(null); }} onExternalMessage={(value) => { controls.setExternalMessage(value); setErrorMessage(null); }}
    onDecision={act.decideSingle} onRetry={act.retryOriginal} />;
}
