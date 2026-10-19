"use client";
/** Owns native viewer checks and cancellable private reads while presenters remain callback-only. @module admission-activity-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@astra-kit/ui";
import { AdmissionMetrics } from "@/components/academy-admissions/admission-metrics";
import { AdmissionActivity } from "@/components/academy-admissions/admission-activity";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import type { AdmissionActivityBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-activity-browser-client";
import type { AdmissionActivityPageState, AdmissionActivityPageSelection } from "@/src/modules/academy-admissions/application/results/admission-activity-page-state";
import { createAdmissionActivityFilterDraft, parseAdmissionActivityFilterDraft } from "@/src/modules/academy-admissions/application/commands/admission-activity-filter-draft";
import { ADMISSION_ACTIVITY_BROWSER_PHASE as PHASE, ADMISSION_ACTIVITY_UI_COPY as COPY, ADMISSION_ACTIVITY_PAGE_KIND as KIND, ADMISSION_ACTIVITY_BROWSER_STATUS as STATUS, type AdmissionActivityBrowserPhase } from "@/src/modules/academy-admissions/constants/admission-activity-browser";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { admissionActivityApiClient } from "@/lib/academy-admissions/admission-activity-api-client";
import styles from "./styles.module.scss";

/** Only safe own SSR state and optional project-owned read ports enter this workflow. */
type ActivityContainerProps = { initialState: AdmissionActivityPageState; client?: AdmissionActivityBrowserClient };
/** @param props - Current server snapshot with no provider or native session material. @returns The sole browser read owner; it never writes settings or refreshes a route after ordinary reads. */
export function AdmissionActivityContainer({ initialState, client = admissionActivityApiClient }: ActivityContainerProps) {
  const ready = initialState.kind === KIND.ready ? initialState : null;
  const [snapshot, setSnapshot] = useState(ready);
  const [draft, setDraft] = useState(ready ? createAdmissionActivityFilterDraft(ready.selection) : null);
  const [phase, setPhase] = useState<AdmissionActivityBrowserPhase>(PHASE.checking);
  const [privateVisible, setPrivateVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null), activated = useRef(false);
  const selectionRef = useRef(ready?.selection);

  /** Rechecks only the native current viewer; own read authorization remains on the server. */
  const checkViewer = useCallback(async (controller: AbortController) => {
    if (!ready || controller.signal.aborted || controllerRef.current !== controller) return false;
    const result = await client.viewer(controller.signal);
    if (controller.signal.aborted || controllerRef.current !== controller || result.status === STATUS.aborted) return false;
    if (result.status === STATUS.failed) { setPrivateVisible(false); setErrorMessage(result.message); setPhase(PHASE.unavailable); return false; }
    if (result.value?.id !== ready.viewerId) { setPrivateVisible(false); setPhase(PHASE.changedViewer); return false; }
    return true;
  }, [ready, client]);

  /** Applies one guarded response only while its original controller and native account remain current. */
  const readSnapshot = useCallback(async (selection: AdmissionActivityPageSelection, controller: AbortController) => {
    if (!ready || controller.signal.aborted) return;
    setPrivateVisible(false); setPhase(PHASE.reading); setErrorMessage(null); setValidationMessage(null);
    try {
      if (!await checkViewer(controller) || controller.signal.aborted || controllerRef.current !== controller) return;
      const result = await client.read(ready.slug, selection, controller.signal);
      if (controller.signal.aborted || controllerRef.current !== controller || result.status === STATUS.aborted) return;
      if (!await checkViewer(controller) || controller.signal.aborted || controllerRef.current !== controller) return;
      if (result.status === STATUS.failed) { setErrorMessage(result.message); setPhase(PHASE.unavailable); return; }
      if (result.value.tribeId !== ready.tribeId || result.value.viewerId !== ready.viewerId) { setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.publicContractUnusable]); setPhase(PHASE.unavailable); return; }
      selectionRef.current = result.value.selection;
      setSnapshot(result.value); setPrivateVisible(true); setPhase(PHASE.ready);
    } catch { if (!controller.signal.aborted && controllerRef.current === controller) { setPrivateVisible(false); setErrorMessage(COPY.readFailed); setPhase(PHASE.unavailable); } }
  }, [ready, client, checkViewer]);

  /** Explicit refresh/filter/pagination supersedes the prior read without preserving stale private content. */
  const launchRead = useCallback((selection: AdmissionActivityPageSelection) => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setPrivateVisible(false); setErrorMessage(null); setValidationMessage(null);
    void readSnapshot(selection, controller);
  }, [readSnapshot]);

  useEffect(() => {
    const controller = new AbortController(); controllerRef.current = controller;
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted || !ready) return;
      const initial = !activated.current; activated.current = true;
      if (!initial && selectionRef.current) { await readSnapshot(selectionRef.current, controller); return; }
      try { if (await checkViewer(controller) && !controller.signal.aborted && controllerRef.current === controller) setPhase(PHASE.ready); }
      catch { if (!controller.signal.aborted && controllerRef.current === controller) { setPrivateVisible(false); setErrorMessage(COPY.readFailed); setPhase(PHASE.unavailable); } }
    });
    /** Restored private UI is withheld until both current identity and server authorization have been rechecked. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted && selectionRef.current) launchRead(selectionRef.current); };
    const visible = () => { if (document.visibilityState === "visible" && selectionRef.current) launchRead(selectionRef.current); };
    window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); controllerRef.current?.abort(); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visible); };
  }, [ready, checkViewer, readSnapshot, launchRead]);

  const reload = () => { if (selectionRef.current) launchRead(selectionRef.current); };
  if (!ready || !snapshot || !draft) return <AdmissionRouteError embedded message={initialState.kind === KIND.unavailable ? initialState.message : COPY.readFailed} reset={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} reset={() => window.location.reload()} />;
  if (!privateVisible) return phase === PHASE.unavailable ? <AdmissionRouteError embedded message={errorMessage ?? COPY.readFailed} reset={reload} /> : <p role="status">{COPY.loading}</p>;
  const busy = phase === PHASE.checking || phase === PHASE.reading;
  /** New filters are checked before transport and always start from their first page. */
  const applyFilters = () => {
    if (busy) return;
    const parsed = parseAdmissionActivityFilterDraft(draft, snapshot.selection.limit);
    if (!parsed.ok) { setValidationMessage(parsed.message); return; }
    launchRead(parsed.value);
  };
  return <div className={styles.AdmissionActivityContainer} aria-busy={busy}>
    <Button type="button" variant="secondary" disabled={busy} onClick={reload}>Actualizar consumo e historial</Button>
    <AdmissionMetrics metrics={snapshot.metrics} currentUsage={snapshot.currentUsage} usageHref={`/${encodeURIComponent(ready.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`} />
    <AdmissionActivity page={snapshot.activity} selection={snapshot.selection} draft={draft} busy={busy} validationMessage={validationMessage}
      onChange={(next) => { setDraft(next); setValidationMessage(null); setErrorMessage(null); }} onApply={applyFilters}
      onOlder={() => { if (!busy && snapshot.activity.nextCursor) launchRead({ ...snapshot.selection, cursor: snapshot.activity.nextCursor }); }} />
  </div>;
}
