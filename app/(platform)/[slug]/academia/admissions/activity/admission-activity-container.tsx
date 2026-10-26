"use client";
/** Owns native viewer checks and cancellable private reads while presenters remain callback-only. @module admission-activity-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@golfo/ui";
import { AdmissionMetrics } from "@/components/academy-admissions/admission-metrics";
import { AdmissionActivity } from "@/components/academy-admissions/admission-activity";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import type { AdmissionActivityBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-activity-browser-client";
import type { AdmissionActivityPageState, AdmissionActivityPageSelection, AdmissionActivityReadyPageState } from "@/src/modules/academy-admissions/application/results/admission-activity-page-state";
import { createAdmissionActivityFilterDraft, parseAdmissionActivityFilterDraft } from "@/src/modules/academy-admissions/application/commands/admission-activity-filter-draft";
import { ADMISSION_ACTIVITY_BROWSER_PHASE as PHASE, ADMISSION_ACTIVITY_UI_COPY as COPY, ADMISSION_ACTIVITY_PAGE_KIND as KIND, ADMISSION_ACTIVITY_BROWSER_STATUS as STATUS, ADMISSION_ACTIVITY_READ_MODE as READ_MODE, type AdmissionActivityBrowserPhase, type AdmissionActivityReadMode } from "@/src/modules/academy-admissions/constants/admission-activity-browser";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { admissionActivityApiClient } from "@/lib/academy-admissions/admission-activity-api-client";
import { appendAdmissionListPage } from "@/lib/academy-admissions/admission-list-pages";
import { isAdmissionAccessLoss } from "@/lib/academy-admissions/admission-access-loss";
import styles from "./styles.module.scss";

/** Only safe own SSR state and optional project-owned read ports enter this workflow. */
type ActivityContainerProps = { initialState: AdmissionActivityPageState; client?: AdmissionActivityBrowserClient };

/**
 * @param shown - The snapshot on screen.
 * @param fresh - The guarded snapshot just read.
 * @param mode - How the read treats the view on screen.
 * @returns The snapshot to show: «Ver actividad anterior» extends the history already loaded; any other read shows the fresh first page with its own cursor, because older pages kept below it could leave a gap of new events that the cursor would skip.
 */
function combineActivitySnapshots(shown: AdmissionActivityReadyPageState, fresh: AdmissionActivityReadyPageState, mode: AdmissionActivityReadMode): AdmissionActivityReadyPageState {
  if (mode === READ_MODE.older) return { ...fresh, selection: shown.selection, activity: { ...fresh.activity, items: appendAdmissionListPage(shown.activity.items, fresh.activity.items) } };
  return fresh;
}

/** @param props - Current server snapshot with no provider or native session material. @returns The sole browser read owner; it never writes settings or refreshes a route after ordinary reads. */
export function AdmissionActivityContainer({ initialState, client = admissionActivityApiClient }: ActivityContainerProps) {
  const ready = initialState.kind === KIND.ready ? initialState : null;
  const [snapshot, setSnapshot] = useState(ready);
  const [draft, setDraft] = useState(ready ? createAdmissionActivityFilterDraft(ready.selection) : null);
  const [phase, setPhase] = useState<AdmissionActivityBrowserPhase>(PHASE.checking);
  const [readMode, setReadMode] = useState<AdmissionActivityReadMode>(READ_MODE.refresh);
  const [privateVisible, setPrivateVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null), activated = useRef(false);
  /** Applied filters without the cursor of an older page, the snapshot a read combines with, and the older pages already shown. */
  const selectionRef = useRef(ready?.selection), snapshotRef = useRef(ready);
  /** The read in flight and whether private facts are on screen: a tab that becomes visible again neither supersedes that read nor reveals withheld facts. */
  const readingRef = useRef<AbortController | null>(null), visibleRef = useRef(true);

  /** @param visible - Whether private facts may be on screen. */
  const showPrivate = useCallback((visible: boolean) => { visibleRef.current = visible; setPrivateVisible(visible); }, []);

  /** Rechecks only the native current viewer; own read authorization remains on the server. */
  const checkViewer = useCallback(async (controller: AbortController) => {
    if (!ready || controller.signal.aborted || controllerRef.current !== controller) return false;
    const result = await client.viewer(controller.signal);
    if (controller.signal.aborted || controllerRef.current !== controller || result.status === STATUS.aborted) return false;
    if (result.status === STATUS.failed) { showPrivate(false); setErrorMessage(result.message); setPhase(PHASE.unavailable); return false; }
    if (result.value?.id !== ready.viewerId) { showPrivate(false); setPhase(PHASE.changedViewer); return false; }
    return true;
  }, [ready, client, showPrivate]);

  /**
   * Applies one guarded response only while its original controller and native account remain current.
   * @param mode - Only a restored view is withheld while it is reread; every other read keeps the facts on screen until the fresh snapshot arrives.
   */
  const readSnapshot = useCallback(async (selection: AdmissionActivityPageSelection, controller: AbortController, mode: AdmissionActivityReadMode) => {
    if (!ready || controller.signal.aborted) return;
    const withheld = mode === READ_MODE.restore || !visibleRef.current;
    if (withheld) showPrivate(false);
    setReadMode(mode); setPhase(PHASE.reading); setErrorMessage(null); setOlderError(null); setValidationMessage(null);
    const current = () => !controller.signal.aborted && controllerRef.current === controller;
    /** A failure the leader can retry keeps the shown facts; a lost authority, or a view that was already withheld, shows the recovery instead. */
    const fail = (message: string, code?: string) => {
      if (withheld || code !== undefined && isAdmissionAccessLoss(code)) { showPrivate(false); setErrorMessage(message); setPhase(PHASE.unavailable); return; }
      if (mode === READ_MODE.older) setOlderError(message); else setErrorMessage(message);
      setPhase(PHASE.ready);
    };
    try {
      if (!await checkViewer(controller) || !current()) return;
      const result = await client.read(ready.slug, selection, controller.signal);
      if (!current() || result.status === STATUS.aborted) return;
      if (!await checkViewer(controller) || !current()) return;
      if (result.status === STATUS.failed) { fail(result.message, result.code); return; }
      if (result.value.tribeId !== ready.tribeId || result.value.viewerId !== ready.viewerId) { showPrivate(false); setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.publicContractUnusable]); setPhase(PHASE.unavailable); return; }
      const next = combineActivitySnapshots(snapshotRef.current ?? result.value, result.value, mode);
      if (mode !== READ_MODE.older) selectionRef.current = result.value.selection;
      snapshotRef.current = next; setSnapshot(next); showPrivate(true); setPhase(PHASE.ready);
    } catch { if (current()) fail(COPY.readFailed); }
    finally { if (readingRef.current === controller) readingRef.current = null; }
  }, [ready, client, checkViewer, showPrivate]);

  /** Explicit refresh, filters and older pages supersede the prior read; only a restored document withholds the facts on screen. */
  const launchRead = useCallback((selection: AdmissionActivityPageSelection, mode: AdmissionActivityReadMode) => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller; readingRef.current = controller;
    void readSnapshot(selection, controller, mode);
  }, [readSnapshot]);

  useEffect(() => {
    const controller = new AbortController(); controllerRef.current = controller;
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted || !ready) return;
      const initial = !activated.current; activated.current = true;
      if (!initial && selectionRef.current) { readingRef.current = controller; await readSnapshot(selectionRef.current, controller, READ_MODE.restore); return; }
      try { if (await checkViewer(controller) && !controller.signal.aborted && controllerRef.current === controller) setPhase(PHASE.ready); }
      catch { if (!controller.signal.aborted && controllerRef.current === controller) { showPrivate(false); setErrorMessage(COPY.readFailed); setPhase(PHASE.unavailable); } }
    });
    /** Restored private UI is withheld until both current identity and server authorization have been rechecked. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted && selectionRef.current) launchRead(selectionRef.current, READ_MODE.restore); };
    /** Returning to the tab rereads in the background: the shown facts stay until the fresh snapshot replaces them, and a read in flight is not superseded. */
    const visible = () => { if (document.visibilityState === "visible" && selectionRef.current && visibleRef.current && !readingRef.current) launchRead(selectionRef.current, READ_MODE.refresh); };
    window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); controllerRef.current?.abort(); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visible); };
  }, [ready, checkViewer, readSnapshot, launchRead, showPrivate]);

  const reload = () => { if (selectionRef.current) launchRead(selectionRef.current, privateVisible ? READ_MODE.refresh : READ_MODE.restore); };
  if (!ready || !snapshot || !draft) return <AdmissionRouteError embedded message={initialState.kind === KIND.unavailable ? initialState.message : COPY.readFailed} retry={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} retry={() => window.location.reload()} />;
  if (!privateVisible) return phase === PHASE.unavailable ? <AdmissionRouteError embedded message={errorMessage ?? COPY.readFailed} retry={reload} /> : <p role="status">{COPY.loading}</p>;
  const busy = phase === PHASE.checking || phase === PHASE.reading;
  const readingOlder = phase === PHASE.reading && readMode === READ_MODE.older, updating = phase === PHASE.reading && !readingOlder;
  /** New filters are checked before transport and always start from their first page. */
  const applyFilters = () => {
    if (busy) return;
    const parsed = parseAdmissionActivityFilterDraft(draft, snapshot.selection.limit);
    if (!parsed.ok) { setValidationMessage(parsed.message); return; }
    launchRead(parsed.value, READ_MODE.replace);
  };
  return <div className={styles.AdmissionActivityContainer} aria-busy={busy}>
    <div className={styles.AdmissionActivityContainer__toolbar}>
      <Button type="button" variant="secondary" disabled={busy} onClick={reload}>Actualizar consumo e historial</Button>
      {updating && <p role="status" className={styles.AdmissionActivityContainer__status}>{COPY.updating}</p>}
    </div>
    {errorMessage && <p role="alert" className={styles.AdmissionActivityContainer__error}>{errorMessage}</p>}
    <AdmissionMetrics metrics={snapshot.metrics} currentUsage={snapshot.currentUsage} usageHref={`/${encodeURIComponent(ready.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`} />
    <AdmissionActivity page={snapshot.activity} selection={snapshot.selection} draft={draft} busy={busy} validationMessage={validationMessage} readingOlder={readingOlder} olderError={olderError}
      onChange={(next) => { setDraft(next); setValidationMessage(null); setErrorMessage(null); }} onApply={applyFilters}
      onOlder={() => { if (!busy && snapshot.activity.nextCursor && selectionRef.current) launchRead({ ...selectionRef.current, cursor: snapshot.activity.nextCursor }, READ_MODE.older); }} />
  </div>;
}
