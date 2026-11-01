/** Reads, recovers and sends reviewer decisions for the review container, through its stable state controls. @module admission-review-workflow */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import type { AdmissionBatchResultDto, AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionTransitionResult } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";
import type { AdmissionNotificationRefreshOutcome } from "@/src/modules/notifications/application/results/notification-refresh-state";
import { readAdmissionReviewIntent, writeAdmissionReviewIntent, type AdmissionBatchReviewSelection, type AdmissionStoredReviewIntent } from "@/lib/academy-admissions/admission-review-intent";
import { isAdmissionBatchReviewIntent, type AdmissionBatchReviewIntent, type AdmissionReviewIntent } from "@/src/modules/academy-admissions/application/results/admission-review-intent";
import { createAdmissionBatchDecisionInput, getAdmissionBatchReviewTransitions, projectAdmissionBatchReviewRecovery } from "@/src/modules/academy-admissions/application/results/admission-batch-browser-result";
import { ADMISSION_REVIEW_UI_COPY, ADMISSION_REVIEW_PHASE, type AdmissionReviewPendingAction } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_BATCH_REVIEW_COPY } from "@/src/modules/academy-admissions/constants/admission-batch-review-ui";
import { applyAdmissionReviewTransition, matchesAdmissionReviewTransitionSelection } from "@/src/modules/academy-admissions/application/results/admission-review-transition";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OPERATION_TYPE, ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { invalidateAdmissionNotificationRefresh } from "@/lib/notifications/admission-notification-refresh-store";
import { readVisibleAdmissionReviewSnapshot } from "@/lib/academy-admissions/admission-review-refresh-client";
import { NOTIFICATION_REFRESH_OUTCOME } from "@/src/modules/notifications/constants/admission-notification-refresh";
import type { useAdmissionReviewBatchSelection } from "@/hooks/use-admission-review-batch-selection";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** Browser phase of the reviewer inbox. */
export type ReviewPhase = "idle" | "reading" | "writing" | "uncertain" | "changed_viewer";
/** Server snapshot of a review route the viewer may read. */
export type ReviewReady = Extract<AdmissionReviewPageState, { kind: "ready" }>;
type BatchActions = ReturnType<typeof useAdmissionReviewBatchSelection>["actions"];
type ResourceFailure = { code: string; message: string };
type RecoveredOperation = Extract<Awaited<ReturnType<AdmissionReviewBrowserClient["operation"]>>, { status: "ready" }>["value"];
type BatchIntent = AdmissionBatchReviewIntent;
type DecisionIntent = AdmissionReviewIntent;

/** Stable setters and refs of the review container; their identity never changes between renders. */
export type ReviewControls = {
  setItems: (value: AdmissionReviewDto[]) => void; setCursor: (value: string | null) => void; setSelected: Dispatch<SetStateAction<AdmissionReviewDto | null>>;
  setPhase: Dispatch<SetStateAction<ReviewPhase>>; setWritingAction: (value: AdmissionReviewPendingAction | null) => void;
  setFresh: (value: boolean) => void; setConfirmed: (value: boolean) => void; setCanRetry: (value: boolean) => void; setPrivateVisible: (value: boolean) => void;
  setInternalReason: (value: string) => void; setExternalMessage: (value: string) => void; setStatusMessage: (value: string | null) => void;
  setBatchManifest: (value: AdmissionBatchReviewSelection[]) => void; setBatchPending: (value: boolean) => void; setBatchResult: (value: AdmissionBatchResultDto | null) => void;
  /** Publishes the platform requirement of the latest inbox read; its ref is what recovery reads. */
  setPlatformRequirement: (value: PlatformSecurityRequirement | null) => void; platformRequirement: RefObject<PlatformSecurityRequirement | null>;
  pending: RefObject<AdmissionStoredReviewIntent | null>; currentSelected: RefObject<AdmissionReviewDto | null>; loaded: RefObject<boolean>; busy: RefObject<boolean>;
  currentItems: RefObject<AdmissionReviewDto[]>; readController: RefObject<AbortController | null>; writeController: RefObject<AbortController | null>;
  consumedSnapshotAt: RefObject<string | null>; visibleReadRevision: RefObject<number>; loadedPageCount: RefObject<number>;
};

/** Current route snapshot, transport, controls and the container callbacks every read and write reuses. */
export type ReviewSession = {
  ready: ReviewReady; client: AdmissionReviewBrowserClient; controls: ReviewControls; appliedFilters: AdmissionReviewSelection; batchActions: BatchActions;
  checkViewer: (signal: AbortSignal, quiet?: boolean) => Promise<boolean>; handleResourceFailure: (result: ResourceFailure, options?: { readonly action: boolean }) => void;
  applyTransitions: (results: readonly AdmissionTransitionResult[]) => void; publishItems: (next: AdmissionReviewDto[]) => void;
  setErrorMessage: (message: string | null) => void; clearReadError: () => void;
};
/** One explicit or initial read of the inbox window. */
export type ReviewReadRequest = { selectionId?: string; append: boolean; after?: string | null; useServerSnapshot: boolean };

/** @param current - Phase when the work settles. @param pending - Original command still stored, if any. @returns A changed viewer as is; otherwise uncertain while an original is pending, or idle. */
function settledReviewPhase(current: ReviewPhase, pending: AdmissionStoredReviewIntent | null): ReviewPhase {
  if (current === ADMISSION_REVIEW_PHASE.changedViewer) return current;
  return pending ? ADMISSION_REVIEW_PHASE.uncertain : ADMISSION_REVIEW_PHASE.idle;
}

/** @param session - Current route session. @returns Nothing after forgetting the stored original. */
function forgetReviewIntent({ ready, controls }: ReviewSession): void {
  writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); controls.pending.current = null;
}

/** @param session - Current route session. @returns Nothing after loading the stored original once with its reasons. */
function restoreReviewIntent({ ready, controls }: ReviewSession): void {
  if (controls.loaded.current) return;
  controls.pending.current = readAdmissionReviewIntent(ready.viewerId, ready.slug); controls.loaded.current = true;
  controls.setBatchPending(Boolean(controls.pending.current && isAdmissionBatchReviewIntent(controls.pending.current)));
  if (controls.pending.current) { controls.setInternalReason(controls.pending.current.input.internalReason); controls.setExternalMessage(controls.pending.current.input.externalMessage ?? ""); }
}

/** @param session - Current route session. @param result - Completed batch. @returns Nothing after applying its transitions and forgetting the original. */
function completeBatch(session: ReviewSession, result: AdmissionBatchResultDto): void {
  const { controls } = session;
  session.applyTransitions(getAdmissionBatchReviewTransitions(result)); session.batchActions.clear(); controls.setStatusMessage(null); invalidateAdmissionNotificationRefresh();
  forgetReviewIntent(session); controls.setBatchPending(false);
}

/** @param session - Current route session. @param original - Stored batch. @param operation - Recovered operation. @returns Whether the read may continue. */
function recoverBatchOriginal(session: ReviewSession, original: BatchIntent, operation: RecoveredOperation): boolean {
  const projected = projectAdmissionBatchReviewRecovery(original, operation);
  if (!projected) { session.setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return false; }
  session.controls.setBatchResult(projected);
  // The authorized original remains visible if the separate inbox read fails; freshness still blocks new decisions.
  session.controls.setPrivateVisible(true);
  if (projected.state === OPERATION_STATE.completed) completeBatch(session, projected);
  else offerStartedOriginalRetry(session);
  return true;
}

/**
 * A registered original that did not finish (its effect rolled back or is still running) can be resent as is: the ledger reclaims it once
 * nobody works on it and never applies it twice. While the platform cannot protect a decision the resend would stay unresolved, so it is not offered.
 * @param session - Current route session.
 * @returns Nothing after offering the retry of the same original.
 */
function offerStartedOriginalRetry(session: ReviewSession): void {
  if (!session.controls.platformRequirement.current) session.controls.setCanRetry(true);
}

/** @param original - Stored decision. @param result - Recovered transition. @returns Whether it is the exact transition the decision expected. */
function isExpectedTransition(original: DecisionIntent, result: AdmissionTransitionResult): boolean {
  const expected = original.input.decision === ADMISSION_DECISION.approve ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.rejected;
  return result.admissionRequestId === original.requestId.toLowerCase() && result.status === expected && result.version === original.input.expectedVersion + 1;
}

/** @param session - Current route session. @param original - Stored decision. @param operation - Recovered operation. @returns Whether the read may continue. */
function recoverDecisionOriginal(session: ReviewSession, original: DecisionIntent, operation: RecoveredOperation): boolean {
  if (operation.type !== ADMISSION_OPERATION_TYPE.decide || operation.operationId !== original.input.operationId.toLowerCase()) { session.setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return false; }
  if (operation.state !== OPERATION_STATE.completed) { offerStartedOriginalRetry(session); session.controls.setStatusMessage(ADMISSION_REVIEW_UI_COPY.started); return true; }
  if ("code" in operation.result) {
    if (operation.result.admissionRequestId !== original.requestId.toLowerCase()) { session.setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return false; }
    forgetReviewIntent(session);
    session.controls.setStatusMessage(""); session.setErrorMessage(ADMISSION_ERROR_MESSAGE[operation.result.code]);
    return true;
  }
  if (!isExpectedTransition(original, operation.result)) { session.setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return false; }
  forgetReviewIntent(session); session.applyTransitions([operation.result]); session.controls.setStatusMessage(ADMISSION_REVIEW_UI_COPY.recovered); invalidateAdmissionNotificationRefresh();
  return true;
}

/**
 * An absent original never registered. While the platform cannot protect a decision every resend would be rejected the same way, so
 * the original is released instead of offered again, and the reviewer reads why; nothing was recorded.
 * @param session - Current route session.
 * @param original - Stored original the registry does not have.
 * @returns Nothing after forgetting it.
 */
function releaseUnprotectedOriginal(session: ReviewSession, original: AdmissionStoredReviewIntent): void {
  forgetReviewIntent(session);
  if (isAdmissionBatchReviewIntent(original)) { session.controls.setBatchPending(false); session.controls.setBatchManifest([]); }
  session.setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.platformSecurityUnavailable]);
}

/** @param session - Current route session. @param original - Stored original. @param signal - Current read. @returns Whether the read may continue to the inbox window. */
async function recoverReviewOriginal(session: ReviewSession, original: AdmissionStoredReviewIntent, signal: AbortSignal): Promise<boolean> {
  const { ready, client, controls } = session;
  if (isAdmissionBatchReviewIntent(original)) controls.setBatchManifest(original.selection);
  const recovery = await client.operation(ready.slug, original.input.operationId, signal);
  if (signal.aborted || recovery.status === "aborted") return false;
  if (!await session.checkViewer(signal)) return false;
  if (recovery.status === "ready") return isAdmissionBatchReviewIntent(original) ? recoverBatchOriginal(session, original, recovery.value) : recoverDecisionOriginal(session, original, recovery.value);
  if (recovery.code === ADMISSION_ERROR_CODE.resourceUnavailable) {
    if (controls.platformRequirement.current) releaseUnprotectedOriginal(session, original);
    else controls.setCanRetry(true);
    return true;
  }
  session.handleResourceFailure(recovery);
  return false;
}

/** @param session - Current route session. @param fromSnapshot - Whether the server snapshot is reused. @param selectionId - Request to open, if any. @param signal - Current read. @returns The detail read, the snapshot's own selection, or null without a selection. */
async function readReviewDetail({ ready, client }: ReviewSession, fromSnapshot: boolean, selectionId: string | undefined, signal: AbortSignal) {
  if (fromSnapshot) return ready.selected ? { status: "ready" as const, value: ready.selected } : null;
  return selectionId ? client.reviewDetail(ready.slug, selectionId, signal) : null;
}

/** @param session - Current route session. @param signal - Current read. @param request - Window to read and the request to open. @param original - Original still stored, if any. @returns Whether the window and selection were read and published. */
async function readReviewWindow(session: ReviewSession, signal: AbortSignal, { selectionId, append, after, useServerSnapshot }: ReviewReadRequest, original: AdmissionStoredReviewIntent | null): Promise<boolean> {
  const { ready, client, controls } = session;
  const fromSnapshot = useServerSnapshot && !original && (!selectionId || selectionId === ready.selected?.id);
  const page = fromSnapshot ? { status: "ready" as const, value: ready.page } : await client.reviewList(ready.slug, append ? after ?? null : null, signal, ready.filters ?? DEFAULT_ADMISSION_REVIEW_SELECTION);
  if (signal.aborted || page.status === "aborted") return false;
  if (page.status === "failed") { session.handleResourceFailure(page); return false; }
  const detail = await readReviewDetail(session, fromSnapshot, selectionId, signal);
  if (signal.aborted || detail?.status === "aborted") return false;
  if (detail?.status === "failed") { session.handleResourceFailure(detail); return false; }
  if (!await session.checkViewer(signal) || signal.aborted || controls.readController.current?.signal !== signal) return false;
  const existing = new Set(controls.currentItems.current.map((item) => item.id));
  session.publishItems(append ? [...controls.currentItems.current, ...page.value.items.filter((item) => !existing.has(item.id))] : page.value.items);
  controls.loadedPageCount.current = append ? controls.loadedPageCount.current + 1 : 1;
  controls.setCursor(page.value.nextCursor); controls.setPlatformRequirement(page.value.platformRequirement);
  const selectedValue = detail?.status === "ready" ? detail.value : null;
  controls.setSelected(selectedValue); controls.currentSelected.current = selectedValue; controls.setPrivateVisible(true); controls.setFresh(true); session.clearReadError();
  return true;
}

/** Reads the original operation first, then current inbox/detail; absence never manufactures started work. @param session - Current route session. @param signal - Current read. @param request - Window to read and the request to open. @param clearRefreshFailure - Clears a failed background refresh once a read succeeds. @returns Nothing after settling the phase. */
export async function readReviewCurrent(session: ReviewSession, signal: AbortSignal, request: ReviewReadRequest, clearRefreshFailure: () => void): Promise<void> {
  const { controls } = session;
  let selectionId = request.selectionId;
  controls.setFresh(false); controls.setPhase(ADMISSION_REVIEW_PHASE.reading); session.setErrorMessage(null); controls.setCanRetry(false);
  try {
    if (!await session.checkViewer(signal)) return;
    restoreReviewIntent(session);
    const original = controls.pending.current;
    if (original) {
      if (!await recoverReviewOriginal(session, original, signal)) return;
      selectionId = isAdmissionBatchReviewIntent(original) ? undefined : original.requestId;
    }
    if (await readReviewWindow(session, signal, { ...request, selectionId }, original)) clearRefreshFailure();
  } catch { if (!signal.aborted) { controls.setFresh(false); session.setErrorMessage(ADMISSION_REVIEW_UI_COPY.storageFailed); } }
  finally { if (!signal.aborted) controls.setPhase((current) => settledReviewPhase(current, controls.pending.current)); }
}

/** @param controls - Stable controls. @param signal - Background refresh. @returns The outcome of a refresh whose viewer check failed. */
function quietViewerFailure(controls: ReviewControls, signal: AbortSignal): AdmissionNotificationRefreshOutcome {
  if (signal.aborted) return NOTIFICATION_REFRESH_OUTCOME.skipped;
  controls.setFresh(false);
  return NOTIFICATION_REFRESH_OUTCOME.failed;
}

/** @param session - Current route session. @param failure - Failed snapshot. @returns The failed outcome, after hiding private facts on a lost authority. */
function refreshFailure(session: ReviewSession, failure: ResourceFailure): AdmissionNotificationRefreshOutcome {
  if (failure.code === ADMISSION_ERROR_CODE.authenticationRequired || failure.code === ADMISSION_ERROR_CODE.permissionDenied) session.handleResourceFailure(failure);
  else session.controls.setFresh(false);
  return NOTIFICATION_REFRESH_OUTCOME.failed;
}

/** Refreshes the already loaded window without clearing selection, drafts or confirmation for equal data. @param session - Current route session. @param signal - Background refresh. @returns Whether the window was refreshed, skipped or failed. */
export async function refreshVisibleReviewWindow(session: ReviewSession, signal: AbortSignal): Promise<AdmissionNotificationRefreshOutcome> {
  const { ready, client, controls } = session;
  if (controls.busy.current || controls.pending.current) return NOTIFICATION_REFRESH_OUTCOME.skipped;
  const revision = controls.visibleReadRevision.current, selectedId = controls.currentSelected.current?.id;
  const current = () => !signal.aborted && revision === controls.visibleReadRevision.current && !controls.busy.current && !controls.pending.current && controls.currentSelected.current?.id === selectedId;
  try {
    if (!await session.checkViewer(signal, true)) return quietViewerFailure(controls, signal);
    const snapshot = await readVisibleAdmissionReviewSnapshot({ client, slug: ready.slug, filters: session.appliedFilters, pages: controls.loadedPageCount.current, selectedId, signal, isCurrent: current });
    if (!current() || snapshot.status === "aborted") return NOTIFICATION_REFRESH_OUTCOME.skipped;
    if (snapshot.status === "failed") return refreshFailure(session, snapshot);
    if (!await session.checkViewer(signal, true)) return quietViewerFailure(controls, signal);
    if (!current()) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    session.publishItems(snapshot.value.items);
    controls.setCursor(snapshot.value.nextCursor); controls.setPlatformRequirement(snapshot.value.platformRequirement);
    if (JSON.stringify(controls.currentSelected.current) !== JSON.stringify(snapshot.value.selected)) { controls.setSelected(snapshot.value.selected); controls.currentSelected.current = snapshot.value.selected; controls.setConfirmed(false); }
    controls.setFresh(true); session.clearReadError();
    return NOTIFICATION_REFRESH_OUTCOME.refreshed;
  } catch {
    if (!current()) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    controls.setFresh(false); return NOTIFICATION_REFRESH_OUTCOME.failed;
  }
}

/** @param session - Current route session. @param intent - Stored batch. @param signal - Current write. @returns Nothing after applying or keeping the batch. */
async function sendBatchDecision(session: ReviewSession, intent: BatchIntent, signal: AbortSignal): Promise<void> {
  const { ready, client, controls } = session;
  controls.setBatchManifest(intent.selection);
  const result = await client.decideBatch(ready.slug, createAdmissionBatchDecisionInput(intent), signal);
  if (signal.aborted || result.status === "aborted" || !await session.checkViewer(signal)) return;
  if (result.status === "failed") {
    session.handleResourceFailure(result, { action: true });
    if (!result.uncertain) { forgetReviewIntent(session); controls.setBatchPending(false); }
    return;
  }
  controls.setBatchResult(result.value);
  if (result.value.state === OPERATION_STATE.completed) completeBatch(session, result.value);
}

/** @param session - Current route session. @param intent - Stored decision. @param signal - Current write. @returns Nothing after applying or keeping the decision. */
async function sendSingleDecision(session: ReviewSession, intent: DecisionIntent, signal: AbortSignal): Promise<void> {
  const { ready, client, controls } = session;
  const result = await client.decide(ready.slug, intent.requestId, intent.input, signal);
  if (signal.aborted || result.status === "aborted") return;
  if (!await session.checkViewer(signal)) return;
  if (result.status === "failed") {
    session.handleResourceFailure(result, { action: true });
    if (!result.uncertain) forgetReviewIntent(session);
    return;
  }
  if ("state" in result.value) return;
  forgetReviewIntent(session);
  session.applyTransitions([result.value]); controls.setStatusMessage(ADMISSION_REVIEW_UI_COPY.complete); invalidateAdmissionNotificationRefresh();
}

/** Focus handling of an individual decision, owned by the container. */
export type ReviewDecisionFocus = { captureActionFocus: () => void; finishActionFocus: () => void };

/**
 * Persists the immutable original intention before sending; uncertain/aborted writes reconcile before any retry.
 * @param session - Current route session.
 * @param focus - Focus handling of an individual decision.
 * @param intent - Exact individual or batch original.
 * @param action - Control the reviewer pressed, shown as in progress while the write lasts.
 * @returns Nothing after settling the phase.
 */
export async function sendReviewIntent(session: ReviewSession, focus: ReviewDecisionFocus, intent: AdmissionStoredReviewIntent, action: AdmissionReviewPendingAction): Promise<void> {
  const { ready, controls } = session;
  if (controls.busy.current) return;
  if (!isAdmissionBatchReviewIntent(intent)) focus.captureActionFocus();
  controls.busy.current = true; controls.visibleReadRevision.current += 1; controls.readController.current?.abort();
  const controller = new AbortController(); controls.writeController.current = controller;
  controls.setWritingAction(action); controls.setPhase(ADMISSION_REVIEW_PHASE.writing); controls.setFresh(false); session.setErrorMessage(null); controls.setStatusMessage(null); controls.setConfirmed(false);
  session.batchActions.resetConfirmation();
  try {
    if (!await session.checkViewer(controller.signal)) return;
    writeAdmissionReviewIntent(ready.viewerId, ready.slug, intent); controls.pending.current = intent;
    controls.setBatchPending(isAdmissionBatchReviewIntent(intent));
    if (isAdmissionBatchReviewIntent(intent)) await sendBatchDecision(session, intent, controller.signal);
    else await sendSingleDecision(session, intent, controller.signal);
  } catch { if (!controller.signal.aborted) session.setErrorMessage(ADMISSION_REVIEW_UI_COPY.storageFailed); }
  finally {
    if (controls.writeController.current === controller) { controls.busy.current = false; if (!controller.signal.aborted) focus.finishActionFocus(); }
    if (!controller.signal.aborted) { controls.setPhase((current) => settledReviewPhase(current, controls.pending.current)); controls.setCanRetry(false); }
  }
}

/** @param items - Loaded window. @param selection - Selected batch rows. @returns Which batch decisions the selection allows and whether approving needs the shared reason. */
export function batchAvailabilityFor(items: AdmissionReviewDto[], selection: readonly AdmissionBatchReviewSelection[]) {
  const visible = new Map(items.map((item) => [item.id, item]));
  return { approve: selection.some((selected) => visible.get(selected.requestId)?.eligibleActions.includes(ADMISSION_DECISION.approve)), reject: selection.some((selected) => visible.get(selected.requestId)?.eligibleActions.includes(ADMISSION_DECISION.reject)),
    /** One selected exception makes the shared reason necessary for approving the batch. */
    approveRequiresReason: selection.some((selected) => visible.get(selected.requestId)?.restrictions.requiresExceptionReason === true) };
}

/** @param items - Loaded window. @param selection - Batch manifest. @param decision - Requested decision. @returns Whether every row is still pending at its selected version and at least one allows the decision. */
export function isBatchDecisionValid(items: AdmissionReviewDto[], selection: readonly AdmissionBatchReviewSelection[], decision: AdmissionReviewDto["eligibleActions"][number]): boolean {
  if (!selection.length || !selection.some((selected) => items.some((item) => item.id === selected.requestId && item.eligibleActions.includes(decision)))) return false;
  return selection.every((selected) => items.some((item) => item.id === selected.requestId && item.version === selected.expectedVersion && item.status === ADMISSION_REQUEST_STATUS.pending));
}

/** @param controls - Stable controls. @param batchActions - Batch selection actions. @param next - Current data window. @returns Nothing after publishing it and invalidating only selections that no longer name its original visible versions. */
export function publishReviewItems(controls: ReviewControls, batchActions: BatchActions, next: AdmissionReviewDto[]): void {
  if (!controls.pending.current && batchActions.reconcile(next)) controls.setStatusMessage(ADMISSION_BATCH_REVIEW_COPY.selectionChanged);
  if (JSON.stringify(controls.currentItems.current) === JSON.stringify(next)) return;
  controls.currentItems.current = next; controls.setItems(next);
}

/** Stable controls, batch actions and page feedback that private facts are hidden through. */
export type ReviewPrivacyScope = { controls: ReviewControls; batchActions: BatchActions; setErrorMessage: (message: string | null) => void };

/** Hides previous-account or revoked-audience facts before showing recovery controls. @param scope - Controls, batch actions and page feedback. @param message - Safe message. @param changed - Whether the viewer changed. @returns Nothing. */
export function hideReviewPrivate({ controls, batchActions, setErrorMessage }: ReviewPrivacyScope, message: string, changed = false): void {
  controls.currentItems.current = []; controls.setItems([]); controls.setSelected(null); controls.currentSelected.current = null; controls.setCursor(null); controls.setFresh(false); controls.setConfirmed(false); controls.setCanRetry(false); controls.setPrivateVisible(false);
  controls.setInternalReason(""); controls.setExternalMessage(""); setErrorMessage(message);
  batchActions.clear(); controls.setBatchManifest([]); controls.setBatchResult(null);
  if (changed) controls.setPhase(ADMISSION_REVIEW_PHASE.changedViewer);
}

/** @param transitions - Confirmed transitions by request. @param request - Request shown. @returns The request with its transition applied, or as is without one. */
function withTransition(transitions: ReadonlyMap<string, AdmissionTransitionResult>, request: AdmissionReviewDto): AdmissionReviewDto {
  const transition = transitions.get(request.id);
  return transition ? applyAdmissionReviewTransition(request, transition) : request;
}

/** Applies only minimal confirmed resource changes; older replay cannot replace newer reviewer data. @param controls - Stable controls. @param appliedFilters - Current inbox filters. @param publishItems - Publishes the window. @param results - Confirmed transitions. @returns Nothing. */
export function applyReviewTransitions(controls: ReviewControls, appliedFilters: AdmissionReviewSelection, publishItems: (next: AdmissionReviewDto[]) => void, results: readonly AdmissionTransitionResult[]): void {
  if (!results.length) return;
  const transitions = new Map(results.map((result) => [result.admissionRequestId, result]));
  controls.visibleReadRevision.current += 1;
  publishItems(controls.currentItems.current.flatMap((request) => {
    const result = transitions.get(request.id);
    if (!result) return [request];
    const next = applyAdmissionReviewTransition(request, result);
    return next === request || matchesAdmissionReviewTransitionSelection(next, appliedFilters) ? [next] : [];
  }));
  controls.setSelected((current) => current && withTransition(transitions, current));
  if (controls.currentSelected.current) controls.currentSelected.current = withTransition(transitions, controls.currentSelected.current);
}

/** Read entry point of the container: a selection, whether it appends a page, its cursor and whether the server snapshot is reused. */
export type ReviewReader = (signal: AbortSignal, request: ReviewReadRequest) => Promise<void>;

/** Explicit interactions share one cancellable read slot; a concurrent write cannot be replaced by a read. @param controls - Stable controls. @param batchActions - Batch selection actions. @param readCurrent - Read entry point. @param request - Request to open, page append and cursor. @returns Nothing. */
export function startReviewRead(controls: ReviewControls, batchActions: BatchActions, readCurrent: ReviewReader, { selectionId, append = false, after }: { selectionId?: string; append?: boolean; after?: string | null }): void {
  if (controls.busy.current) return;
  controls.visibleReadRevision.current += 1;
  if (selectionId && selectionId !== controls.currentSelected.current?.id) controls.setStatusMessage(null);
  controls.readController.current?.abort();
  const controller = new AbortController(); controls.readController.current = controller;
  controls.setConfirmed(false);
  batchActions.resetConfirmation();
  void readCurrent(controller.signal, { selectionId, append, after, useServerSnapshot: false });
}

/** Reads on mount and rereads a restored page. @param controls - Stable controls. @param renderedAt - Server snapshot time. @param readCurrent - Read entry point. @param launchRead - Explicit read. @returns The cleanup that aborts reads and writes in flight. */
export function startReviewLifecycle(controls: ReviewControls, renderedAt: string | null, readCurrent: ReviewReader, launchRead: (selectionId?: string) => void): () => void {
  controls.visibleReadRevision.current += 1;
  const controller = new AbortController(); controls.readController.current = controller;
  void Promise.resolve().then(() => {
    if (controller.signal.aborted) return;
    const useServerSnapshot = renderedAt !== controls.consumedSnapshotAt.current;
    controls.consumedSnapshotAt.current = renderedAt;
    // The server snapshot stays on screen while the current viewer is checked, with its actions disabled until the read is fresh; an already consumed one (restored Activity) is withheld.
    controls.loaded.current = false; controls.loadedPageCount.current = 1; if (!useServerSnapshot) controls.setPrivateVisible(false); controls.setConfirmed(false);
    return readCurrent(controller.signal, { selectionId: controls.currentSelected.current?.id, append: false, after: null, useServerSnapshot });
  });
  /** Restored Activity/bfcache must reload the original scoped intent before enabling another decision. */
  const restored = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    controls.writeController.current?.abort(); controls.busy.current = false;
    controls.loaded.current = false; controls.setPrivateVisible(false); controls.setFresh(false); launchRead(controls.currentSelected.current?.id);
  };
  window.addEventListener("pageshow", restored);
  return () => { controller.abort(); controls.readController.current?.abort(); controls.writeController.current?.abort(); controls.loaded.current = false; controls.busy.current = false; window.removeEventListener("pageshow", restored); };
}

/** @param controls - Stable controls. @returns Nothing after closing the open request without changing the inbox. */
export function closeReviewSelection(controls: ReviewControls): void {
  if (controls.pending.current || controls.busy.current) return;
  controls.currentSelected.current = null; controls.setSelected(null); controls.setConfirmed(false); controls.setInternalReason(""); controls.setExternalMessage(""); controls.setStatusMessage(null);
}
