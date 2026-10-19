"use client";
/** Owns viewer checks, explicit writes and original recovery while presenters receive callbacks only. @module admission-notification-settings-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@golfo/ui";
import { AdmissionNotificationSettings } from "@/components/academy-admissions/admission-notification-settings";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import type { AdmissionNotificationSettingsPageState } from "@/src/modules/notifications/application/results/admission-notification-settings-page-state";
import type { AdmissionNotificationSettingsBrowserClient, AdmissionNotificationSettingsBoundResult } from "@/src/modules/notifications/application/ports/admission-notification-settings-browser-client";
import type { AdmissionNotificationEmailSettingsCommand } from "@/src/modules/notifications/domain/repositories/admission-notification-email-settings-repository";
import type { AdmissionNotificationEmailSettingsDraft } from "@/src/modules/notifications/application/commands/admission-notification-email-settings-draft";
import type { AdmissionNotificationPreferenceMode } from "@/src/modules/notifications/domain/entities/admission-notification-preference";
import { admissionNotificationSettingsApiClient } from "@/lib/academy-admissions/admission-notification-settings-api-client";
import { readAdmissionNotificationSettingsIntent, writeAdmissionNotificationSettingsIntent } from "@/lib/academy-admissions/admission-notification-settings-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { admissionNotificationEmailSettingsCommandSchema } from "@/src/modules/notifications/constants/admission-notification-settings-schemas";
import { ADMISSION_NOTIFICATION_SETTINGS_PHASE as PHASE, ADMISSION_NOTIFICATION_SETTINGS_COPY as COPY, ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY } from "@/src/modules/notifications/constants/admission-notification-settings-browser";
import { ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND as PAGE_KIND, ADMISSION_NOTIFICATION_SETTINGS_BROWSER_STATUS as STATUS } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { ADMISSION_NOTIFICATION_PREFERENCE_MODE as MODE, ADMISSION_NOTIFICATION_PREFERENCE_STATUS as PREFERENCE_STATUS } from "@/src/modules/notifications/constants/admission-notification-preference";
import { ADMISSION_EMAIL_SETTINGS_STATUS as EMAIL_STATUS } from "@/src/modules/notifications/constants/admission-notification-email-settings";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";

/** Explicit local phases do not derive types from a runtime constant. */
type SettingsPhase = "checking" | "reading" | "writing" | "idle" | "uncertain" | "changed_viewer";
/** Safe SSR data and owned ports isolate effects from the presentational forms. */
type ContainerProps = { initialState: AdmissionNotificationSettingsPageState; client?: AdmissionNotificationSettingsBrowserClient };

/** @param props - Current guarded SSR snapshot and optional own interaction ports. @returns Account-scoped settings with cancellable reads and no automatic mutation or full-route refresh. */
export function AdmissionNotificationSettingsContainer({ initialState, client = admissionNotificationSettingsApiClient }: ContainerProps) {
  const ready = initialState.kind === PAGE_KIND.ready ? initialState : null;
  const [preference, setPreference] = useState(ready?.preference ?? null), [email, setEmail] = useState(ready?.email ?? null);
  const [mode, setMode] = useState<AdmissionNotificationPreferenceMode>(ready?.preference.mode ?? MODE.omitted);
  const [draft, setDraft] = useState<AdmissionNotificationEmailSettingsDraft>({ enabled: ready?.email?.enabled ?? false, timeZone: ready?.email?.timeZone ?? "" });
  const [phase, setPhase] = useState<SettingsPhase>(PHASE.checking), [fresh, setFresh] = useState(false), [privateVisible, setPrivateVisible] = useState(true);
  const [confirmed, setConfirmed] = useState(false), [hasPending, setHasPending] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null), [preferenceStatus, setPreferenceStatus] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null), [emailStatus, setEmailStatus] = useState<string | null>(null);
  const pending = useRef<AdmissionNotificationEmailSettingsCommand | null>(null), loaded = useRef(false), mounted = useRef(false), busy = useRef(false);
  const slot = useRef<AbortController | null>(null);
  const hasEmailView = useRef(Boolean(ready?.email));

  /** Only the currently owned, uncancelled slot may apply asynchronous state or clear a stored original. */
  const isCurrent = useCallback((signal: AbortSignal) => !signal.aborted && slot.current?.signal === signal, []);
  /** Hides previously authorized data after current authority is denied, preserving inaccessible original storage. */
  const hideInaccessibleSettings = useCallback((code: AdmissionErrorCode, message: string) => {
    if (code !== ADMISSION_ERROR_CODE.authenticationRequired && code !== ADMISSION_ERROR_CODE.permissionDenied && code !== ADMISSION_ERROR_CODE.resourceUnavailable) return false;
    setPrivateVisible(false); setFresh(false); setConfirmed(false); setCanRetry(false);
    setPreferenceError(null); setPreferenceStatus(null); setEmailStatus(null); setEmailError(message);
    return true;
  }, []);
  /** Updates render state and the synchronous original-command guard together. */
  const remember = useCallback((input: AdmissionNotificationEmailSettingsCommand | null) => { pending.current = input; setHasPending(input !== null); }, []);
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
    if (viewer.status === STATUS.failed) { setPrivateVisible(false); setFresh(false); setEmailError(viewer.message); return false; }
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

  /** Recovers an immutable original first, then reads current state without applying an historical version over it. */
  const readCurrent = useCallback(async (signal: AbortSignal, initial = false, resetEmailDraft = false) => {
    if (!ready || !isCurrent(signal)) return;
    setPhase(PHASE.reading); setFresh(false); setConfirmed(false); setCanRetry(false);
    let recovered = false, recoveredSucceeded = false;
    try {
      if (!await checkViewer(signal) || !isCurrent(signal)) return;
      let canConfigureEmail = ready.canConfigureEmail;
      if (initial && canConfigureEmail) restoreEmailIntent();
      const needsCurrent = !initial || pending.current !== null;
      if (needsCurrent) {
        const currentPreference = await client.readPreference(ready.slug, signal);
        if (!isCurrent(signal) || currentPreference.status === STATUS.aborted || !await checkViewer(signal) || !isCurrent(signal)) return;
        if (currentPreference.status === STATUS.failed) { setPrivateVisible(false); setPreferenceError(currentPreference.message); return; }
        if (!await accept(currentPreference.value, signal) || !isCurrent(signal)) return;
        setPreference(currentPreference.value.data.preference); canConfigureEmail = currentPreference.value.data.canConfigureEmail;
      }
      if (!canConfigureEmail) {
        // Retain inaccessible privileged storage for its original account; personal preferences remain independent.
        remember(null); loaded.current = false; hasEmailView.current = false; setEmail(null);
        setEmailError(null); setEmailStatus(null);
        setPrivateVisible(true); setFresh(true); return;
      }
      restoreEmailIntent();
      if (pending.current) {
        const result = await client.operation(ready.slug, pending.current.operationId, signal);
        if (!isCurrent(signal) || result.status === STATUS.aborted || !await checkViewer(signal) || !isCurrent(signal)) return;
        if (result.status === STATUS.ready) {
          if (!await accept(result.value, signal) || !isCurrent(signal)) return;
          if (result.value.data.state === OPERATION_STATE.started) { setCanRetry(true); setEmailError(COPY.originalStarted); }
          else {
            const terminal = result.value.data.result;
            writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); remember(null); recovered = true;
            if (terminal.status === EMAIL_STATUS.rejected) setEmailError(ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY[terminal.reason]);
            else { setEmailError(null); recoveredSucceeded = true; }
          }
        } else if (result.code === ADMISSION_ERROR_CODE.resourceUnavailable) { setCanRetry(true); setEmailError(COPY.originalAbsent); }
        else { setPrivateVisible(false); setEmailError(result.message); return; }
      }
      if (needsCurrent || pending.current || recovered) {
        const currentEmail = await client.readEmail(ready.slug, signal);
        if (!isCurrent(signal) || currentEmail.status === STATUS.aborted || !await checkViewer(signal) || !isCurrent(signal)) return;
        if (currentEmail.status === STATUS.failed) { setPrivateVisible(false); setEmailError(currentEmail.message); return; }
        if (!await accept(currentEmail.value, signal) || !isCurrent(signal)) return;
        const initializeDraft = !hasEmailView.current; hasEmailView.current = true; setEmail(currentEmail.value.data);
        if (recovered || resetEmailDraft || initializeDraft && !pending.current) setDraft({ enabled: currentEmail.value.data.enabled, timeZone: currentEmail.value.data.timeZone });
      }
      setPrivateVisible(true); setFresh(true);
      if (recoveredSucceeded || resetEmailDraft) setEmailStatus(COPY.recovered);
    } catch { if (isCurrent(signal)) { loaded.current = false; setEmailError(COPY.storageFailed); } }
    finally { if (isCurrent(signal)) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  }, [ready, client, checkViewer, accept, remember, restoreEmailIntent, isCurrent]);

  /** Uses one request slot; an explicit read never replaces a live mutation. */
  const launchRead = useCallback(() => {
    if (busy.current) return;
    busy.current = true; slot.current?.abort(); const controller = new AbortController(); slot.current = controller;
    setPreferenceError(null); setEmailError(null); setPreferenceStatus(null); setEmailStatus(null);
    void readCurrent(controller.signal).finally(() => { if (slot.current === controller) busy.current = false; });
  }, [readCurrent]);

  useEffect(() => {
    const controller = new AbortController(); let isActive = true; slot.current = controller; busy.current = true;
    void Promise.resolve().then(async () => {
      if (!isActive || controller.signal.aborted) return;
      const initial = !mounted.current; mounted.current = true;
      if (!initial) { loaded.current = false; setPrivateVisible(false); }
      await readCurrent(controller.signal, initial);
    }).finally(() => { if (slot.current === controller) busy.current = false; });
    /** A restored page must recheck the original and current authority before another write. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { slot.current?.abort(); busy.current = false; loaded.current = false; setPrivateVisible(false); setFresh(false); setConfirmed(false); launchRead(); } };
    window.addEventListener("pageshow", restored);
    return () => { isActive = false; controller.abort(); slot.current?.abort(); loaded.current = false; busy.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent, launchRead]);

  /** Saves only the current recipient's CAS choice; lost replies require a read instead of an automatic retry. */
  const savePreference = async () => {
    if (!ready || !preference || !fresh || busy.current) return;
    busy.current = true; slot.current?.abort(); const controller = new AbortController(); slot.current = controller;
    setPhase(PHASE.writing); setFresh(false); setPreferenceError(null); setPreferenceStatus(null); setConfirmed(false);
    try {
      if (!await checkViewer(controller.signal) || !isCurrent(controller.signal)) return;
      const result = await client.changePreference(ready.slug, { mode, expectedVersion: preference.version }, controller.signal);
      if (!isCurrent(controller.signal) || result.status === STATUS.aborted || !await checkViewer(controller.signal) || !isCurrent(controller.signal)) return;
      if (result.status === STATUS.failed) { if (!hideInaccessibleSettings(result.code, result.message)) setPreferenceError(result.uncertain ? COPY.preferenceUncertain : result.message); return; }
      if (!await accept(result.value, controller.signal) || !isCurrent(controller.signal)) return;
      if (result.value.data.status === PREFERENCE_STATUS.rejected) { setPreferenceError(COPY.preferenceConflict); toast.error(COPY.preferenceConflict); return; }
      setPreference(result.value.data.preference); setFresh(true);
      const message = result.value.data.status === PREFERENCE_STATUS.changed ? COPY.preferenceSaved : COPY.preferenceUnchanged;
      setPreferenceStatus(message); toast.success(message);
    } catch { if (isCurrent(controller.signal)) setPreferenceError(COPY.preferenceUncertain); }
    finally { if (slot.current === controller) busy.current = false; if (isCurrent(controller.signal)) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  };

  /** Persists before transport and retains the same original body through uncertainty or a legacy session-change answer. */
  const sendEmail = async (input: AdmissionNotificationEmailSettingsCommand) => {
    if (!ready || !email || !fresh || !confirmed || busy.current) return;
    busy.current = true; slot.current?.abort(); const controller = new AbortController(); slot.current = controller; let dispatched = false;
    setPhase(PHASE.writing); setFresh(false); setConfirmed(false); setCanRetry(false); setEmailError(null); setEmailStatus(null);
    try {
      if (!await checkViewer(controller.signal) || !isCurrent(controller.signal)) return;
      writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, input); remember(input); dispatched = true;
      const result = await client.changeEmail(ready.slug, input, controller.signal);
      if (!isCurrent(controller.signal) || result.status === STATUS.aborted || !await checkViewer(controller.signal) || !isCurrent(controller.signal)) return;
      if (result.status === STATUS.failed) {
        if (hideInaccessibleSettings(result.code, result.message)) return;
        setEmailError(result.message);
        if (result.code === ADMISSION_ERROR_CODE.reauthenticationRequired) { setCanRetry(true); setFresh(true); }
        else if (!result.uncertain) { writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); remember(null); }
        return;
      }
      if (!await accept(result.value, controller.signal) || !isCurrent(controller.signal)) return;
      if (result.value.data.state === OPERATION_STATE.started) { setEmailError(COPY.uncertain); toast.info(COPY.uncertain); return; }
      const operation = result.value.data, terminal = operation.result;
      writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); remember(null);
      if (terminal.status === EMAIL_STATUS.rejected) { const message = ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY[terminal.reason]; setEmailError(message); toast.error(message); return; }
      if (operation.replayed) { setEmailStatus(null); await readCurrent(controller.signal, false, true); return; }
      setEmail(terminal.settings); setDraft({ enabled: terminal.settings.enabled, timeZone: terminal.settings.timeZone }); setFresh(true);
      const message = terminal.status === EMAIL_STATUS.changed ? COPY.emailSaved : COPY.emailUnchanged; setEmailStatus(message); toast.success(message);
    } catch { if (isCurrent(controller.signal)) { if (!dispatched) loaded.current = false; setEmailError(dispatched ? COPY.uncertain : COPY.storageFailed); } }
    finally { if (slot.current === controller) busy.current = false; if (isCurrent(controller.signal)) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  };

  if (!ready || !preference) return <AdmissionRouteError embedded message={initialState.kind === PAGE_KIND.unavailable ? initialState.message : COPY.storageFailed} reset={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} reset={() => window.location.reload()} />;
  if (!privateVisible) return phase === PHASE.reading || phase === PHASE.checking ? <p role="status">{COPY.checking}</p> : <AdmissionRouteError embedded message={emailError ?? preferenceError ?? ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]} reset={launchRead} />;
  const isBusy = phase === PHASE.checking || phase === PHASE.reading || phase === PHASE.writing;
  /** A fresh UUID is created only after explicit confirmation; an original pending command always takes precedence. */
  const saveEmail = () => {
    if (!email || !fresh || !confirmed || pending.current || busy.current) return;
    const input = admissionNotificationEmailSettingsCommandSchema.safeParse({ ...draft, timeZone: draft.timeZone.trim(), operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: email.version });
    if (!input.success) { setEmailError(COPY.invalid); return; }
    void sendEmail(input.data);
  };
  return <AdmissionNotificationSettings preference={preference} mode={mode} email={email} draft={draft} busy={isBusy} disabled={!fresh} confirmed={confirmed} pending={hasPending} canRetry={canRetry && fresh} preferenceError={preferenceError} preferenceStatus={preferenceStatus} emailError={emailError} emailStatus={emailStatus} messagingHref={`/${encodeURIComponent(ready.slug)}/${MESSAGING_CONNECTIONS_SETTINGS_SEGMENT}`}
    onMode={(value) => { setMode(value); setPreferenceError(null); setPreferenceStatus(null); }} onSavePreference={() => { void savePreference(); }}
    onDraft={(value) => { setDraft(value); setConfirmed(false); setEmailError(null); setEmailStatus(null); }} onConfirm={(value) => { setConfirmed(value); setEmailError(null); }} onSaveEmail={saveEmail} onRead={launchRead}
    onRetryOriginal={() => { if (pending.current && canRetry && fresh && confirmed && !busy.current) void sendEmail(pending.current); }} />;
}
