"use client";
/** Owns native viewer checks, reviewer reads and original decision reconciliation. @module admission-review-container */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionTransitionResult } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { AdmissionReview } from "@/components/academy-admissions/admission-review";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { readAdmissionReviewIntent, writeAdmissionReviewIntent, admissionReviewIntentSchema, type AdmissionReviewIntent } from "@/lib/academy-admissions/admission-review-intent";
import { ADMISSION_REVIEW_UI_COPY, ADMISSION_REVIEW_PHASE } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OPERATION_TYPE, ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** Public props contain the server snapshot and an optional own transport port for behavioral tests. */
type ReviewContainerProps = { initialState: AdmissionReviewPageState; client?: AdmissionReviewBrowserClient };

/** @param props - Guarded deterministic server state and own client adapter. @returns A single route owner; presenters receive callbacks only. */
export function AdmissionReviewContainer({ initialState, client = admissionApiClient }: ReviewContainerProps) {
  const ready = initialState.kind === "ready" ? initialState : null;
  const [items, setItems] = useState<AdmissionReviewDto[]>(ready?.page.items ?? []), [cursor, setCursor] = useState(ready?.page.nextCursor ?? null);
  const [selected, setSelected] = useState<AdmissionReviewDto | null>(ready?.selected ?? null);
  const [phase, setPhase] = useState<"idle" | "reading" | "writing" | "uncertain" | "changed_viewer">(ADMISSION_REVIEW_PHASE.idle);
  const [fresh, setFresh] = useState(false), [confirmed, setConfirmed] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [privateVisible, setPrivateVisible] = useState(true);
  const [internalReason, setInternalReason] = useState(""), [externalMessage, setExternalMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  const pending = useRef<AdmissionReviewIntent | null>(null), currentSelected = useRef(selected), loaded = useRef(false), busy = useRef(false);
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);

  /** Hides previous-account or revoked-audience facts before showing recovery controls. */
  const hidePrivate = useCallback((message: string, changed = false) => {
    setItems([]); setSelected(null); currentSelected.current = null; setCursor(null); setFresh(false); setConfirmed(false); setCanRetry(false);
    setInternalReason(""); setExternalMessage(""); setErrorMessage(message);
    if (changed) setPhase(ADMISSION_REVIEW_PHASE.changedViewer);
  }, []);

  /** Validates native identity before every read/write and again before publishing asynchronous results. */
  const checkViewer = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (!ready || signal.aborted) return false;
    const viewer = await client.viewer(signal);
    if (signal.aborted || viewer.status === "aborted") return false;
    if (viewer.status === "failed") { setPrivateVisible(false); setFresh(false); setErrorMessage(ADMISSION_REVIEW_UI_COPY.readFailed); return false; }
    if (viewer.value?.id !== ready.viewerId) { hidePrivate(ADMISSION_REVIEW_UI_COPY.changedViewer, true); return false; }
    return true;
  }, [client, ready, hidePrivate]);

  /** Current auth/permission denial clears stale private data; recoverable transport errors keep edits disabled. */
  const readFailure = useCallback((result: { code: string; message: string }) => {
    if (result.code === ADMISSION_ERROR_CODE.authenticationRequired || result.code === ADMISSION_ERROR_CODE.permissionDenied) hidePrivate(result.message);
    else { setFresh(false); setErrorMessage(result.message); }
  }, [hidePrivate]);

  /** Applies only minimal confirmed resource changes; older replay cannot replace newer reviewer data. */
  const applyTransition = useCallback((result: AdmissionTransitionResult) => {
    setItems((current) => current.filter((request) => request.id !== result.admissionRequestId || request.version > result.version));
    setSelected((current) => current?.id === result.admissionRequestId && current.version <= result.version ? { ...current, status: result.status, version: result.version, eligibleActions: [], needsVerification: false } : current);
    if (currentSelected.current?.id === result.admissionRequestId && currentSelected.current.version <= result.version) currentSelected.current = { ...currentSelected.current, status: result.status, version: result.version, eligibleActions: [], needsVerification: false };
  }, []);

  /** Reads the original operation first, then current inbox/detail; absence never manufactures started work. */
  const readCurrent = useCallback(async (signal: AbortSignal, selectionId?: string, append = false, after?: string | null) => {
    if (!ready) return;
    setFresh(false); setPhase(ADMISSION_REVIEW_PHASE.reading); setErrorMessage(null); setCanRetry(false);
    try {
      if (!await checkViewer(signal)) return;
      if (!loaded.current) {
        pending.current = readAdmissionReviewIntent(ready.viewerId, ready.slug); loaded.current = true;
        if (pending.current) { setInternalReason(pending.current.input.internalReason); setExternalMessage(pending.current.input.externalMessage ?? ""); }
      }
      const original = pending.current;
      if (original) {
        const recovery = await client.operation(ready.slug, original.input.operationId, signal);
        if (signal.aborted || recovery.status === "aborted") return;
        if (!await checkViewer(signal)) return;
        if (recovery.status === "ready") {
          const operation = recovery.value;
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
              writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null; applyTransition(operation.result); setStatusMessage(ADMISSION_REVIEW_UI_COPY.recovered);
            }
          }
        } else if (recovery.code === ADMISSION_ERROR_CODE.resourceUnavailable) setCanRetry(true);
        else { readFailure(recovery); return; }
        selectionId = original.requestId;
      }
      const page = await client.reviewList(ready.slug, append ? after ?? null : null, signal);
      if (signal.aborted || page.status === "aborted") return;
      if (page.status === "failed") { readFailure(page); return; }
      const detail = selectionId ? await client.reviewDetail(ready.slug, selectionId, signal) : null;
      if (signal.aborted || detail?.status === "aborted") return;
      if (detail?.status === "failed") { readFailure(detail); return; }
      if (!await checkViewer(signal)) return;
      setItems((current) => append ? [...current, ...page.value.items.filter((request) => !current.some((existing) => existing.id === request.id))] : page.value.items);
      setCursor(page.value.nextCursor);
      const selectedValue = detail?.status === "ready" ? detail.value : null;
      setSelected(selectedValue); currentSelected.current = selectedValue; setPrivateVisible(true); setFresh(true);
    } catch { if (!signal.aborted) { setFresh(false); setErrorMessage(ADMISSION_REVIEW_UI_COPY.storageFailed); } }
    finally { if (!signal.aborted) setPhase((current) => current === ADMISSION_REVIEW_PHASE.changedViewer ? current : pending.current ? ADMISSION_REVIEW_PHASE.uncertain : ADMISSION_REVIEW_PHASE.idle); }
  }, [ready, client, checkViewer, readFailure, applyTransition]);

  /** Explicit interactions share one cancellable read slot; a concurrent write cannot be replaced by a read. */
  const launchRead = useCallback((selectionId?: string, append = false, after?: string | null) => {
    if (busy.current) return;
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    setConfirmed(false);
    void readCurrent(controller.signal, selectionId, append, after);
  }, [readCurrent]);

  useEffect(() => {
    const controller = new AbortController(); readController.current = controller;
    void Promise.resolve().then(() => { if (!controller.signal.aborted) { loaded.current = false; setPrivateVisible(false); setConfirmed(false); return readCurrent(controller.signal, currentSelected.current?.id); } });
    /** Restored Activity/bfcache must reload the original scoped intent before enabling another decision. */
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      writeController.current?.abort(); busy.current = false;
      loaded.current = false; setPrivateVisible(false); setFresh(false); launchRead(currentSelected.current?.id);
    };
    window.addEventListener("pageshow", restored);
    return () => { controller.abort(); readController.current?.abort(); writeController.current?.abort(); loaded.current = false; busy.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent, launchRead]);

  /** Persists the immutable original intention before sending; uncertain/aborted writes reconcile before any retry. */
  const send = async (intent: AdmissionReviewIntent) => {
    if (!ready || busy.current) return;
    busy.current = true; readController.current?.abort();
    const controller = new AbortController(); writeController.current = controller;
    setPhase(ADMISSION_REVIEW_PHASE.writing); setFresh(false); setErrorMessage(null); setStatusMessage(null); setConfirmed(false);
    try {
      if (!await checkViewer(controller.signal)) return;
      writeAdmissionReviewIntent(ready.viewerId, ready.slug, intent); pending.current = intent;
      const result = await client.decide(ready.slug, intent.requestId, intent.input, controller.signal);
      if (controller.signal.aborted || result.status === "aborted") return;
      if (!await checkViewer(controller.signal)) return;
      if (result.status === "failed") {
        readFailure(result);
        if (!result.uncertain) { writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null; }
        return;
      }
      if ("state" in result.value) return;
      writeAdmissionReviewIntent(ready.viewerId, ready.slug, null); pending.current = null;
      applyTransition(result.value); setStatusMessage(ADMISSION_REVIEW_UI_COPY.complete);
    } catch { if (!controller.signal.aborted) setErrorMessage(ADMISSION_REVIEW_UI_COPY.storageFailed); }
    finally {
      if (writeController.current === controller) busy.current = false;
      if (!controller.signal.aborted) { setPhase((current) => current === ADMISSION_REVIEW_PHASE.changedViewer ? current : pending.current ? ADMISSION_REVIEW_PHASE.uncertain : ADMISSION_REVIEW_PHASE.idle); setCanRetry(false); }
    }
  };

  if (!ready) return <AdmissionRouteError message={initialState.kind === "unavailable" ? initialState.message : ADMISSION_REVIEW_UI_COPY.readFailed} reset={() => window.location.reload()} />;
  if (phase === ADMISSION_REVIEW_PHASE.changedViewer) return <AdmissionRouteError message={ADMISSION_REVIEW_UI_COPY.changedViewer} reset={() => window.location.reload()} />;
  if (!privateVisible && phase !== ADMISSION_REVIEW_PHASE.reading) return <AdmissionRouteError message={ADMISSION_REVIEW_UI_COPY.readFailed} reset={() => launchRead(currentSelected.current?.id)} />;
  const uncertain = phase === ADMISSION_REVIEW_PHASE.uncertain;
  const formDisabled = !fresh || phase === ADMISSION_REVIEW_PHASE.reading || phase === ADMISSION_REVIEW_PHASE.writing;
  return <AdmissionReview items={privateVisible ? items : []} selected={privateVisible ? selected : null} hasMore={privateVisible && cursor !== null} busy={phase === ADMISSION_REVIEW_PHASE.reading || phase === ADMISSION_REVIEW_PHASE.writing} disabled={formDisabled} confirmed={confirmed} internalReason={internalReason} externalMessage={externalMessage} errorMessage={errorMessage} statusMessage={privateVisible ? statusMessage : ADMISSION_REVIEW_UI_COPY.reading} uncertain={uncertain} canRetry={canRetry}
    onSelect={(id) => { if (pending.current) return; setInternalReason(""); setExternalMessage(""); launchRead(id); }} onClose={() => { if (pending.current || busy.current) return; currentSelected.current = null; setSelected(null); setConfirmed(false); setInternalReason(""); setExternalMessage(""); }}
    onRead={() => launchRead(currentSelected.current?.id)} onLoadMore={() => launchRead(undefined, true, cursor)} onConfirm={(value) => { setConfirmed(value); setErrorMessage(null); }}
    onInternalReason={(value) => { setInternalReason(value); setErrorMessage(null); }} onExternalMessage={(value) => { setExternalMessage(value); setErrorMessage(null); }}
    onDecision={(decision) => {
      if (!selected || formDisabled || !confirmed || pending.current || !selected.eligibleActions.includes(decision)) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.invalid); return; }
      const parsed = admissionReviewIntentSchema.safeParse({ requestId: selected.id, input: { operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: selected.version, decision, internalReason, externalMessage } });
      if (!parsed.success) { setErrorMessage(ADMISSION_REVIEW_UI_COPY.invalid); return; }
      void send(parsed.data);
    }} onRetry={() => { if (pending.current && canRetry && confirmed && fresh) void send(pending.current); }} />;
}
