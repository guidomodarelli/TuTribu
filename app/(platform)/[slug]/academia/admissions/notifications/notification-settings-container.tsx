"use client";
/** Owns viewer checks, the chained explicit save and original recovery while presenters receive callbacks only. @module admission-notification-settings-container */
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useViewerTimeZone } from "@golfo/ui/hooks";
import { AdmissionNotificationSettings } from "@/components/academy-admissions/admission-notification-settings";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import type { AdmissionNotificationSettingsPageState } from "@/src/modules/notifications/application/results/admission-notification-settings-page-state";
import type { AdmissionNotificationSettingsBrowserClient } from "@/src/modules/notifications/application/ports/admission-notification-settings-browser-client";
import type { AdmissionNotificationEmailSettingsCommand } from "@/src/modules/notifications/domain/repositories/admission-notification-email-settings-repository";
import type { AdmissionNotificationEmailSettingsDraft } from "@/src/modules/notifications/application/commands/admission-notification-email-settings-draft";
import type { AdmissionNotificationPreferenceMode } from "@/src/modules/notifications/domain/entities/admission-notification-preference";
import { admissionNotificationSettingsApiClient } from "@/lib/academy-admissions/admission-notification-settings-api-client";
import { ADMISSION_NOTIFICATION_SETTINGS_PHASE as PHASE, ADMISSION_NOTIFICATION_SETTINGS_COPY as COPY, type AdmissionNotificationSettingsSaveStep } from "@/src/modules/notifications/constants/admission-notification-settings-browser";
import { ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND as PAGE_KIND } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { ADMISSION_NOTIFICATION_RECOMMENDED_MODE } from "@/src/modules/notifications/constants/admission-notification-settings-options";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { draftFromEmail, draftModeFor, emailPlanFor, hasPreferenceChange, isSettled, isUnconfiguredEmail, usableTimeZone } from "./notification-settings-plan";
import { readSettingsCurrent, resetSettingsEmailDraft, REVIEW_STEP_INDEX, saveNotificationSettings, type ReadOptions, type SettingsControls, type SettingsPhase } from "./notification-settings-workflow";

/** Safe SSR data and owned ports isolate effects from the presentational forms. */
type ContainerProps = { initialState: AdmissionNotificationSettingsPageState; client?: AdmissionNotificationSettingsBrowserClient };

/** @param props - Current guarded SSR snapshot and optional own interaction ports. @returns Account-scoped settings with cancellable reads, one chained save and no automatic mutation or full-route refresh. */
export function AdmissionNotificationSettingsContainer({ initialState, client = admissionNotificationSettingsApiClient }: ContainerProps) {
  const ready = initialState.kind === PAGE_KIND.ready ? initialState : null;
  const viewerTimeZone = useViewerTimeZone();
  const [preference, setPreference] = useState(ready?.preference ?? null), [email, setEmail] = useState(ready?.email ?? null);
  const [mode, setMode] = useState<AdmissionNotificationPreferenceMode>(ready ? draftModeFor(ready.preference) : ADMISSION_NOTIFICATION_RECOMMENDED_MODE);
  const [draft, setDraft] = useState<AdmissionNotificationEmailSettingsDraft>(() => draftFromEmail(ready?.email ?? null));
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
  /** Setters and refs never change identity, so one stable bundle serves every read and write. */
  const controls = useMemo<SettingsControls>(() => ({ setPreference, setEmail, setMode, setDraft, setPhase, setFresh, setPrivateVisible, setConfirmed, setHasPending, setCanRetry, setError, setStatus, setProgress, setSaving, setEditing, setStep, pending, loaded, busy, slot, hasEmailView, modeEdited, zoneEdited }), []);

  /** Recovers an immutable original first, then reads current state without applying an historical version over it. @returns Whether the current state was read completely. */
  const readCurrent = useCallback(async (signal: AbortSignal, options: ReadOptions = {}) => {
    if (!ready) return false;
    return readSettingsCurrent({ ready, client, controls }, signal, options);
  }, [ready, client, controls]);

  /** Uses one request slot; an explicit read never replaces a live mutation. */
  const launchRead = useCallback(() => {
    if (busy.current) return;
    busy.current = true; slot.current?.abort(); const controller = new AbortController(); slot.current = controller;
    setError(null); setStatus(null); setProgress(null);
    void readCurrent(controller.signal).finally(() => { if (slot.current === controller) busy.current = false; });
  }, [readCurrent]);
  /** The restore listener always relaunches with the latest read, without making it a subscription dependency. */
  const relaunchRead = useEffectEvent(() => launchRead());

  useEffect(() => {
    const controller = new AbortController(); let isActive = true; slot.current = controller; busy.current = true;
    void Promise.resolve().then(async () => {
      if (!isActive || controller.signal.aborted) return;
      const initial = !mounted.current; mounted.current = true;
      if (!initial) { loaded.current = false; setPrivateVisible(false); }
      await readCurrent(controller.signal, { initial });
    }).finally(() => { if (slot.current === controller) busy.current = false; });
    /** A restored page must recheck the original and current authority before another write. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { slot.current?.abort(); busy.current = false; loaded.current = false; setPrivateVisible(false); setFresh(false); setConfirmed(false); relaunchRead(); } };
    window.addEventListener("pageshow", restored);
    return () => { isActive = false; controller.abort(); slot.current?.abort(); loaded.current = false; busy.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent]);

  if (!ready || !preference) return <AdmissionRouteError embedded message={initialState.kind === PAGE_KIND.unavailable ? initialState.message : COPY.storageFailed} retry={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} retry={() => window.location.reload()} />;
  if (!privateVisible) return <SettingsWithheld checking={phase === PHASE.reading || phase === PHASE.checking} error={error} retry={launchRead} />;
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
    if (!pending.current) resetSettingsEmailDraft(controls, email);
  };

  return <AdmissionNotificationSettings preference={preference} mode={mode} email={email} draft={draft} tribeEmailEnabled={email ? email.enabled : null}
    plan={{ email: emailPlanFor({ email, draft, pending: hasPending, canRetry }), preference: hasPreferenceChange(preference, mode) }}
    editing={editing} step={step} busy={isBusy} disabled={!fresh} confirmed={confirmed} pending={hasPending} saving={saving}
    error={error} status={status} progress={progress} canCancel={settled} messagingHref={`/${encodeURIComponent(ready.slug)}/${MESSAGING_CONNECTIONS_SETTINGS_SEGMENT}`}
    onMode={(value) => { modeEdited.current = true; setMode(value); setConfirmed(false); setError(null); setStatus(null); }}
    onDraft={changeDraft} onConfirm={setConfirmed} onStep={setStep}
    onEdit={() => { setEditing(true); setStep(pending.current ? REVIEW_STEP_INDEX : 0); setStatus(null); }} onCancel={cancel}
    onSave={() => { void saveNotificationSettings({ ready, client, controls, readCurrent }, { preference, email, draft, mode, confirmed, fresh, canRetry }); }} onRead={launchRead} />;
}

/** @param props - Whether a read is still checking, its safe error and the retry. @returns Progress while checking, otherwise the recovery for withheld settings. */
function SettingsWithheld({ checking, error, retry }: { checking: boolean; error: string | null; retry: () => void }) {
  if (checking) return <p role="status">{COPY.checking}</p>;
  return <AdmissionRouteError embedded message={error ?? ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]} retry={retry} />;
}
