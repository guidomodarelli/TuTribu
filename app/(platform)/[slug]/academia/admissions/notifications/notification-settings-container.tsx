"use client";
/** Owns viewer checks, the chained explicit save and original recovery while presenters receive callbacks only. @module admission-notification-settings-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@golfo/ui";
import { useViewerTimeZone } from "@golfo/ui/hooks";
import { AdmissionNotificationSettings } from "@/components/academy-admissions/admission-notification-settings";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import type { AdmissionNotificationSettingsPageState } from "@/src/modules/notifications/application/results/admission-notification-settings-page-state";
import type { AdmissionNotificationSettingsBrowserClient, AdmissionNotificationSettingsBoundResult } from "@/src/modules/notifications/application/ports/admission-notification-settings-browser-client";
import type { AdmissionNotificationEmailSettingsCommand } from "@/src/modules/notifications/domain/repositories/admission-notification-email-settings-repository";
import type { AdmissionNotificationEmailSettingsDraft } from "@/src/modules/notifications/application/commands/admission-notification-email-settings-draft";
import type { AdmissionNotificationPreferenceChange, AdmissionNotificationPreferenceMode } from "@/src/modules/notifications/domain/entities/admission-notification-preference";
import { admissionNotificationSettingsApiClient } from "@/lib/academy-admissions/admission-notification-settings-api-client";
import { readAdmissionNotificationSettingsIntent, writeAdmissionNotificationSettingsIntent } from "@/lib/academy-admissions/admission-notification-settings-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { admissionNotificationEmailSettingsCommandSchema } from "@/src/modules/notifications/constants/admission-notification-settings-schemas";
import { ADMISSION_NOTIFICATION_SETTINGS_PHASE as PHASE, ADMISSION_NOTIFICATION_SETTINGS_COPY as COPY, ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY, ADMISSION_NOTIFICATION_SETTINGS_SAVE_STEP as SAVE_STEP, ADMISSION_NOTIFICATION_SETTINGS_EMAIL_PLAN as EMAIL_PLAN, ADMISSION_NOTIFICATION_SETTINGS_GUIDED_STEP as GUIDED_STEP, ADMISSION_NOTIFICATION_SETTINGS_LEADER_STEP_ORDER, type AdmissionNotificationSettingsSaveStep } from "@/src/modules/notifications/constants/admission-notification-settings-browser";
import { ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND as PAGE_KIND, ADMISSION_NOTIFICATION_SETTINGS_BROWSER_STATUS as STATUS } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { ADMISSION_NOTIFICATION_PREFERENCE_STATUS as PREFERENCE_STATUS } from "@/src/modules/notifications/constants/admission-notification-preference";
import { ADMISSION_NOTIFICATION_RECOMMENDED_MODE } from "@/src/modules/notifications/constants/admission-notification-settings-options";
import { ADMISSION_EMAIL_SETTINGS_STATUS as EMAIL_STATUS } from "@/src/modules/notifications/constants/admission-notification-email-settings";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { draftFromEmail, draftModeFor, emailPlanFor, emailTimeZoneFor, hasPreferenceChange, isSettled, isUnconfiguredEmail, usableTimeZone } from "./notification-settings-plan";

/** Explicit local phases do not derive types from a runtime constant. */
type SettingsPhase = "checking" | "reading" | "writing" | "idle" | "uncertain" | "changed_viewer";
/** Safe SSR data and owned ports isolate effects from the presentational forms. */
type ContainerProps = { initialState: AdmissionNotificationSettingsPageState; client?: AdmissionNotificationSettingsBrowserClient };
/** An explicit read either rebuilds the first view or reconciles a historical original with current state. */
type ReadOptions = { initial?: boolean; resetEmailDraft?: boolean };

/** A retained original resumes on the review step, one confirmation away from its retry. */
const REVIEW_STEP_INDEX = ADMISSION_NOTIFICATION_SETTINGS_LEADER_STEP_ORDER.indexOf(GUIDED_STEP.review);

/** @param props - Current guarded SSR snapshot and optional own interaction ports. @returns Account-scoped settings with cancellable reads, one chained save and no automatic mutation or full-route refresh. */
export function AdmissionNotificationSettingsContainer({ initialState, client = admissionNotificationSettingsApiClient }: ContainerProps) {
  const ready = initialState.kind === PAGE_KIND.ready ? initialState : null;
  const viewerTimeZone = useViewerTimeZone();
  const [preference, setPreference] = useState(ready?.preference ?? null), [email, setEmail] = useState(ready?.email ?? null);
  const [mode, setMode] = useState<AdmissionNotificationPreferenceMode>(ready ? draftModeFor(ready.preference) : ADMISSION_NOTIFICATION_RECOMMENDED_MODE);
  const [draft, setDraft] = useState<AdmissionNotificationEmailSettingsDraft>(draftFromEmail(ready?.email ?? null));
  const [phase, setPhase] = useState<SettingsPhase>(PHASE.checking), [fresh, setFresh] = useState(false), [privateVisible, setPrivateVisible] = useState(true);
  const [confirmed, setConfirmed] = useState(false), [hasPending, setHasPending] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [error, setError] = useState<string | null>(null), [status, setStatus] = useState<string | null>(null), [progress, setProgress] = useState<string | null>(null);
  const [saving, setSaving] = useState<AdmissionNotificationSettingsSaveStep | null>(null);
  const [editing, setEditing] = useState(() => ready ? !isSettled(ready.preference, ready.email, false) : false), [step, setStep] = useState(0);
  const pending = useRef<AdmissionNotificationEmailSettingsCommand | null>(null), loaded = useRef(false), mounted = useRef(false), busy = useRef(false);
  const slot = useRef<AbortController | null>(null);
  const hasEmailView = useRef(Boolean(ready?.email));
  /** A frequency the person picked survives reads; an untouched one follows the saved state. */
  const modeEdited = useRef(false);
  /** A zone the person typed is never replaced by the browser suggestion. */
  const zoneEdited = useRef(false);

  /** Only the currently owned, uncancelled slot may apply asynchronous state or clear a stored original. */
  const isCurrent = useCallback((signal: AbortSignal) => !signal.aborted && slot.current?.signal === signal, []);
  /** Hides previously authorized data after current authority is denied, preserving inaccessible original storage. */
  const hideInaccessibleSettings = useCallback((code: AdmissionErrorCode, message: string) => {
    if (code !== ADMISSION_ERROR_CODE.authenticationRequired && code !== ADMISSION_ERROR_CODE.permissionDenied && code !== ADMISSION_ERROR_CODE.resourceUnavailable) return false;
    setPrivateVisible(false); setFresh(false); setConfirmed(false); setCanRetry(false);
    setStatus(null); setProgress(null); setError(message);
    return true;
  }, []);
  /** Updates render state and the synchronous original-command guard together. */
  const remember = useCallback((input: AdmissionNotificationEmailSettingsCommand | null) => { pending.current = input; setHasPending(input !== null); }, []);
  /** Applies a saved or freshly read email to the editable fields. */
  const resetEmailDraft = useCallback((value: Parameters<typeof draftFromEmail>[0]) => { setDraft(draftFromEmail(value)); zoneEdited.current = false; }, []);
  /** Restores a checked viewer's local command once; role checks still gate privileged recovery and never delete inaccessible storage. */
  const restoreEmailIntent = useCallback(() => {
    if (!ready || loaded.current) return;
    const stored = readAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug); loaded.current = true; remember(stored);
    if (stored) setDraft({ enabled: stored.enabled, timeZone: stored.timeZone });
  }, [ready, remember]);
  /** Samples native identity before storage and after asynchronous replies; cancellation wins over feedback. */
  const checkViewer = useCallback(async (signal: AbortSignal) => {
    if (!ready || !isCurrent(signal)) return false;
    const viewer = await client.viewer(signal);
    if (!isCurrent(signal) || viewer.status === STATUS.aborted) return false;
    if (viewer.status === STATUS.failed) { setPrivateVisible(false); setFresh(false); setError(viewer.message); return false; }
    if (viewer.value?.id !== ready.viewerId) { setPrivateVisible(false); setFresh(false); setPhase(PHASE.changedViewer); return false; }
    return true;
  }, [ready, client, isCurrent]);
  /** Rejects a response actually produced for a different viewer, including a rapid account switch. */
  const accept = useCallback(async (value: AdmissionNotificationSettingsBoundResult<unknown>, signal: AbortSignal) => {
    if (!isCurrent(signal) || !ready) return false;
    if (value.viewerId !== ready.viewerId) { setPrivateVisible(false); setFresh(false); setPhase(PHASE.changedViewer); return false; }
    const accepted = await checkViewer(signal);
    return isCurrent(signal) && accepted;
  }, [ready, checkViewer, isCurrent]);

  /** Recovers an immutable original first, then reads current state without applying an historical version over it. @returns Whether the current state was read completely. */
  const readCurrent = useCallback(async (signal: AbortSignal, { initial = false, resetEmailDraft: resetDraft = false }: ReadOptions = {}) => {
    if (!ready || !isCurrent(signal)) return false;
    setPhase(PHASE.reading); setFresh(false); setConfirmed(false); setCanRetry(false);
    let recovered = false, recoveredSucceeded = false;
    try {
      if (!await checkViewer(signal) || !isCurrent(signal)) return false;
      let canConfigureEmail = ready.canConfigureEmail;
      if (initial && canConfigureEmail) restoreEmailIntent();
      const needsCurrent = !initial || pending.current !== null;
      if (needsCurrent) {
        const currentPreference = await client.readPreference(ready.slug, signal);
        if (!isCurrent(signal) || currentPreference.status === STATUS.aborted || !await checkViewer(signal) || !isCurrent(signal)) return false;
        if (currentPreference.status === STATUS.failed) { setPrivateVisible(false); setError(currentPreference.message); return false; }
        if (!await accept(currentPreference.value, signal) || !isCurrent(signal)) return false;
        const current = currentPreference.value.data.preference;
        setPreference(current); canConfigureEmail = currentPreference.value.data.canConfigureEmail;
        if (!modeEdited.current) setMode(draftModeFor(current));
      }
      if (!canConfigureEmail) {
        // Retain inaccessible privileged storage for its original account; personal preferences remain independent.
        remember(null); loaded.current = false; hasEmailView.current = false; setEmail(null);
        setPrivateVisible(true); setFresh(true); return true;
      }
      restoreEmailIntent();
      if (pending.current) {
        const result = await client.operation(ready.slug, pending.current.operationId, signal);
        if (!isCurrent(signal) || result.status === STATUS.aborted || !await checkViewer(signal) || !isCurrent(signal)) return false;
        if (result.status === STATUS.ready) {
          if (!await accept(result.value, signal) || !isCurrent(signal)) return false;
          if (result.value.data.state === OPERATION_STATE.started) { setCanRetry(true); setError(COPY.originalStarted); }
          else {
            const terminal = result.value.data.result;
            writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); remember(null); recovered = true;
            if (terminal.status === EMAIL_STATUS.rejected) setError(ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY[terminal.reason]);
            else { setError(null); recoveredSucceeded = true; }
          }
        } else if (result.code === ADMISSION_ERROR_CODE.resourceUnavailable) { setCanRetry(true); setError(COPY.originalAbsent); }
        else { setPrivateVisible(false); setError(result.message); return false; }
      }
      if (needsCurrent || pending.current || recovered) {
        const currentEmail = await client.readEmail(ready.slug, signal);
        if (!isCurrent(signal) || currentEmail.status === STATUS.aborted || !await checkViewer(signal) || !isCurrent(signal)) return false;
        if (currentEmail.status === STATUS.failed) { setPrivateVisible(false); setError(currentEmail.message); return false; }
        if (!await accept(currentEmail.value, signal) || !isCurrent(signal)) return false;
        const initializeDraft = !hasEmailView.current; hasEmailView.current = true; setEmail(currentEmail.value.data);
        if (recovered || resetDraft || initializeDraft && !pending.current) resetEmailDraft(currentEmail.value.data);
      }
      // A retained original opens the steps on the review, where its retry needs one fresh confirmation.
      if (pending.current) { setEditing(true); setStep(REVIEW_STEP_INDEX); }
      setPrivateVisible(true); setFresh(true);
      if (recoveredSucceeded || resetDraft) setStatus(COPY.recovered);
      return true;
    } catch { if (isCurrent(signal)) { loaded.current = false; setError(COPY.storageFailed); } return false; }
    finally { if (isCurrent(signal)) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  }, [ready, client, checkViewer, accept, remember, restoreEmailIntent, resetEmailDraft, isCurrent]);

  /** Uses one request slot; an explicit read never replaces a live mutation. */
  const launchRead = useCallback(() => {
    if (busy.current) return;
    busy.current = true; slot.current?.abort(); const controller = new AbortController(); slot.current = controller;
    setError(null); setStatus(null); setProgress(null);
    void readCurrent(controller.signal).finally(() => { if (slot.current === controller) busy.current = false; });
  }, [readCurrent]);

  useEffect(() => {
    const controller = new AbortController(); let isActive = true; slot.current = controller; busy.current = true;
    void Promise.resolve().then(async () => {
      if (!isActive || controller.signal.aborted) return;
      const initial = !mounted.current; mounted.current = true;
      if (!initial) { loaded.current = false; setPrivateVisible(false); }
      await readCurrent(controller.signal, { initial });
    }).finally(() => { if (slot.current === controller) busy.current = false; });
    /** A restored page must recheck the original and current authority before another write. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { slot.current?.abort(); busy.current = false; loaded.current = false; setPrivateVisible(false); setFresh(false); setConfirmed(false); launchRead(); } };
    window.addEventListener("pageshow", restored);
    return () => { isActive = false; controller.abort(); slot.current?.abort(); loaded.current = false; busy.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent, launchRead]);

  /** Persists before transport and retains the same original body through uncertainty or a legacy session-change answer. @returns Whether the tribe email is confirmed saved. */
  const writeEmail = async (input: AdmissionNotificationEmailSettingsCommand, signal: AbortSignal) => {
    if (!ready) return false;
    let dispatched = false;
    try {
      writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, input); remember(input); dispatched = true;
      const result = await client.changeEmail(ready.slug, input, signal);
      if (!isCurrent(signal) || result.status === STATUS.aborted || !await checkViewer(signal) || !isCurrent(signal)) return false;
      if (result.status === STATUS.failed) {
        if (hideInaccessibleSettings(result.code, result.message)) return false;
        setError(result.message);
        if (result.code === ADMISSION_ERROR_CODE.reauthenticationRequired) { setCanRetry(true); setFresh(true); }
        // A definite failure applied nothing: the original is released and the same save can run again.
        else if (!result.uncertain) { writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); remember(null); setFresh(true); }
        return false;
      }
      if (!await accept(result.value, signal) || !isCurrent(signal)) return false;
      if (result.value.data.state === OPERATION_STATE.started) { setError(COPY.uncertain); toast.info(COPY.uncertain); return false; }
      const operation = result.value.data, terminal = operation.result;
      writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); remember(null);
      if (terminal.status === EMAIL_STATUS.rejected) { const message = ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY[terminal.reason]; setError(message); toast.error(message); return false; }
      // A replay answers with historical settings; only an independent current read may update the fields.
      if (operation.replayed) return await readCurrent(signal, { resetEmailDraft: true }) && isCurrent(signal);
      setEmail(terminal.settings); resetEmailDraft(terminal.settings);
      return true;
    } catch { if (isCurrent(signal)) { if (!dispatched) loaded.current = false; setError(dispatched ? COPY.uncertain : COPY.storageFailed); } return false; }
  };

  /** Saves only the current recipient's CAS choice; lost replies require a read instead of an automatic retry. @returns Whether the preference is confirmed saved. */
  const writePreference = async (change: AdmissionNotificationPreferenceChange, signal: AbortSignal) => {
    if (!ready) return false;
    try {
      const result = await client.changePreference(ready.slug, change, signal);
      if (!isCurrent(signal) || result.status === STATUS.aborted || !await checkViewer(signal) || !isCurrent(signal)) return false;
      if (result.status === STATUS.failed) {
        if (hideInaccessibleSettings(result.code, result.message)) return false;
        setError(result.uncertain ? COPY.preferenceUncertain : result.message);
        if (!result.uncertain) setFresh(true);
        return false;
      }
      if (!await accept(result.value, signal) || !isCurrent(signal)) return false;
      if (result.value.data.status === PREFERENCE_STATUS.rejected) { setError(COPY.preferenceConflict); toast.error(COPY.preferenceConflict); return false; }
      setPreference(result.value.data.preference); setMode(result.value.data.preference.mode); modeEdited.current = false;
      return true;
    } catch { if (isCurrent(signal)) setError(COPY.preferenceUncertain); return false; }
  };

  /** Writes only what changed, the tribe email first, in one request slot; a failure reports what stayed saved and stops the chain. */
  const saveSettings = async () => {
    if (!ready || !preference || !fresh || busy.current) return;
    const leader = email !== null;
    // Consent comes before a new operation id exists; a retained original keeps its own id.
    if (leader && !confirmed) return;
    const emailPlan = emailPlanFor({ email, draft, pending: pending.current !== null, canRetry });
    const preferenceChange = hasPreferenceChange(preference, mode) ? { mode, expectedVersion: preference.version } : null;
    let emailInput: AdmissionNotificationEmailSettingsCommand | null = null;
    if (emailPlan === EMAIL_PLAN.retry) emailInput = pending.current;
    else if (emailPlan === EMAIL_PLAN.save && email) {
      const parsed = admissionNotificationEmailSettingsCommandSchema.safeParse({ enabled: draft.enabled, timeZone: emailTimeZoneFor(email, draft), operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: email.version });
      if (!parsed.success) { setError(COPY.invalid); return; }
      emailInput = parsed.data;
    }
    if (!emailInput && !preferenceChange) return;
    busy.current = true; slot.current?.abort(); const controller = new AbortController(); slot.current = controller; const { signal } = controller;
    setPhase(PHASE.writing); setFresh(false); setConfirmed(false); setCanRetry(false); setError(null); setStatus(null); setProgress(null);
    try {
      if (!await checkViewer(signal) || !isCurrent(signal)) return;
      if (emailInput) {
        setSaving(SAVE_STEP.email);
        if (!await writeEmail(emailInput, signal)) { if (preferenceChange && isCurrent(signal)) setProgress(COPY.preferencePending); return; }
      }
      if (preferenceChange) {
        setSaving(SAVE_STEP.preference); setPhase(PHASE.writing);
        if (!await writePreference(preferenceChange, signal)) { if (emailInput && isCurrent(signal)) setProgress(COPY.emailSavedPreferencePending); return; }
      }
      if (!isCurrent(signal)) return;
      setFresh(true); setEditing(false); setStep(0); setStatus(COPY.saved); toast.success(COPY.saved);
    } finally {
      setSaving(null);
      if (slot.current === controller) busy.current = false;
      if (isCurrent(signal)) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle);
    }
  };

  if (!ready || !preference) return <AdmissionRouteError embedded message={initialState.kind === PAGE_KIND.unavailable ? initialState.message : COPY.storageFailed} retry={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} retry={() => window.location.reload()} />;
  if (!privateVisible) return phase === PHASE.reading || phase === PHASE.checking ? <p role="status">{COPY.checking}</p> : <AdmissionRouteError embedded message={error ?? ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]} retry={launchRead} />;
  const isBusy = phase === PHASE.checking || phase === PHASE.reading || phase === PHASE.writing;
  const settled = isSettled(preference, email, hasPending);

  /** Any edit clears consent and stale feedback; turning an unconfigured email on suggests the browser zone once. */
  const changeDraft = (next: AdmissionNotificationEmailSettingsDraft) => {
    const zoneChanged = next.timeZone !== draft.timeZone;
    if (zoneChanged) zoneEdited.current = true;
    const suggested = !zoneChanged && next.enabled && !draft.enabled && isUnconfiguredEmail(email) && !zoneEdited.current ? usableTimeZone(viewerTimeZone) : null;
    setDraft(suggested ? { ...next, timeZone: suggested } : next); setConfirmed(false); setError(null); setStatus(null);
  };
  /** Leaves the steps without saving and restores the saved choices. */
  const cancel = () => {
    setEditing(false); setStep(0); setConfirmed(false); setError(null); setProgress(null);
    modeEdited.current = false; setMode(draftModeFor(preference));
    if (!pending.current) resetEmailDraft(email);
  };

  return <AdmissionNotificationSettings preference={preference} mode={mode} email={email} draft={draft} tribeEmailEnabled={email ? email.enabled : null}
    plan={{ email: emailPlanFor({ email, draft, pending: hasPending, canRetry }), preference: hasPreferenceChange(preference, mode) }}
    editing={editing} step={step} busy={isBusy} disabled={!fresh} confirmed={confirmed} pending={hasPending} saving={saving}
    error={error} status={status} progress={progress} canCancel={settled} messagingHref={`/${encodeURIComponent(ready.slug)}/${MESSAGING_CONNECTIONS_SETTINGS_SEGMENT}`}
    onMode={(value) => { modeEdited.current = true; setMode(value); setConfirmed(false); setError(null); setStatus(null); }}
    onDraft={changeDraft} onConfirm={setConfirmed} onStep={setStep}
    onEdit={() => { setEditing(true); setStep(pending.current ? REVIEW_STEP_INDEX : 0); setStatus(null); }} onCancel={cancel}
    onSave={() => { void saveSettings(); }} onRead={launchRead} />;
}
