/** Reads, recovers and saves admission notification settings for the settings container, through its stable state controls. @module admission-notification-settings-workflow */
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "@golfo/ui";
import type { AdmissionNotificationSettingsPageState } from "@/src/modules/notifications/application/results/admission-notification-settings-page-state";
import type { AdmissionNotificationSettingsBrowserClient, AdmissionNotificationSettingsBoundResult } from "@/src/modules/notifications/application/ports/admission-notification-settings-browser-client";
import type { AdmissionNotificationEmailSettingsCommand } from "@/src/modules/notifications/domain/repositories/admission-notification-email-settings-repository";
import type { AdmissionNotificationEmailSettingsDraft } from "@/src/modules/notifications/application/commands/admission-notification-email-settings-draft";
import type { AdmissionNotificationPreferenceChange, AdmissionNotificationPreferenceMode } from "@/src/modules/notifications/domain/entities/admission-notification-preference";
import type { AdmissionNotificationEmailSettingsOperationResult, AdmissionNotificationEmailSettingsView, AdmissionNotificationPreferenceView } from "@/src/modules/notifications/application/results/admission-notification-settings-result";
import { readAdmissionNotificationSettingsIntent, writeAdmissionNotificationSettingsIntent } from "@/lib/academy-admissions/admission-notification-settings-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { admissionNotificationEmailSettingsCommandSchema } from "@/src/modules/notifications/constants/admission-notification-settings-schemas";
import { ADMISSION_NOTIFICATION_SETTINGS_PHASE as PHASE, ADMISSION_NOTIFICATION_SETTINGS_COPY as COPY, ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY, ADMISSION_NOTIFICATION_SETTINGS_SAVE_STEP as SAVE_STEP, ADMISSION_NOTIFICATION_SETTINGS_EMAIL_PLAN as EMAIL_PLAN, ADMISSION_NOTIFICATION_SETTINGS_GUIDED_STEP as GUIDED_STEP, ADMISSION_NOTIFICATION_SETTINGS_LEADER_STEP_ORDER, type AdmissionNotificationSettingsSaveStep } from "@/src/modules/notifications/constants/admission-notification-settings-browser";
import { ADMISSION_NOTIFICATION_SETTINGS_BROWSER_STATUS as STATUS } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { ADMISSION_NOTIFICATION_PREFERENCE_STATUS as PREFERENCE_STATUS } from "@/src/modules/notifications/constants/admission-notification-preference";
import { ADMISSION_EMAIL_SETTINGS_STATUS as EMAIL_STATUS } from "@/src/modules/notifications/constants/admission-notification-email-settings";
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { draftFromEmail, draftModeFor, emailPlanFor, emailTimeZoneFor, hasPreferenceChange } from "./notification-settings-plan";

/** Explicit local phases do not derive types from a runtime constant. */
export type SettingsPhase = "checking" | "reading" | "writing" | "idle" | "uncertain" | "changed_viewer";
/** An explicit read either rebuilds the first view or reconciles a historical original with current state. */
export type ReadOptions = { initial?: boolean; resetEmailDraft?: boolean };
/** Server snapshot of a settings route the viewer may read. */
export type SettingsReady = Extract<AdmissionNotificationSettingsPageState, { kind: "ready" }>;

/** A retained original resumes on the review step, one confirmation away from its retry. */
export const REVIEW_STEP_INDEX = ADMISSION_NOTIFICATION_SETTINGS_LEADER_STEP_ORDER.indexOf(GUIDED_STEP.review);

/** Stable setters and refs of the settings container; their identity never changes between renders. */
export type SettingsControls = {
  setPreference: (value: AdmissionNotificationPreferenceView) => void; setEmail: (value: AdmissionNotificationEmailSettingsView | null) => void;
  setMode: (value: AdmissionNotificationPreferenceMode) => void; setDraft: (value: AdmissionNotificationEmailSettingsDraft) => void;
  setPhase: Dispatch<SetStateAction<SettingsPhase>>; setFresh: (value: boolean) => void; setPrivateVisible: (value: boolean) => void; setConfirmed: (value: boolean) => void;
  setHasPending: (value: boolean) => void; setCanRetry: (value: boolean) => void; setError: (value: string | null) => void; setStatus: (value: string | null) => void;
  setProgress: (value: string | null) => void; setSaving: (value: AdmissionNotificationSettingsSaveStep | null) => void; setEditing: (value: boolean) => void; setStep: (value: number) => void;
  pending: RefObject<AdmissionNotificationEmailSettingsCommand | null>; loaded: RefObject<boolean>; busy: RefObject<boolean>; slot: RefObject<AbortController | null>;
  hasEmailView: RefObject<boolean>; modeEdited: RefObject<boolean>; zoneEdited: RefObject<boolean>;
};
/** Current route snapshot, transport and stable controls shared by every read and write. */
export type SettingsSession = { ready: SettingsReady; client: AdmissionNotificationSettingsBrowserClient; controls: SettingsControls };
/** A session that can also reread current state after a replayed write. */
export type SettingsWriter = SettingsSession & { readCurrent: (signal: AbortSignal, options?: ReadOptions) => Promise<boolean> };
/** Values on screen when the leader asked to save. */
export type SettingsSaveView = { preference: AdmissionNotificationPreferenceView | null; email: AdmissionNotificationEmailSettingsView | null; draft: AdmissionNotificationEmailSettingsDraft; mode: AdmissionNotificationPreferenceMode; confirmed: boolean; fresh: boolean; canRetry: boolean };

/** Only the currently owned, uncancelled slot may apply asynchronous state or clear a stored original. @param controls - Stable controls. @param signal - Signal of the work. @returns Whether that work still owns the slot. */
function isSlotCurrent(controls: SettingsControls, signal: AbortSignal): boolean {
  return !signal.aborted && controls.slot.current?.signal === signal;
}

/** @param current - Phase when the work settles. @param pending - Original command still stored, if any. @returns A changed viewer as is; otherwise uncertain while an original is pending, or idle. */
function settledSettingsPhase(current: SettingsPhase, pending: AdmissionNotificationEmailSettingsCommand | null): SettingsPhase {
  if (current === PHASE.changedViewer) return current;
  return pending ? PHASE.uncertain : PHASE.idle;
}

/** Hides previously authorized data after current authority is denied, preserving inaccessible original storage. @param controls - Stable controls. @param code - Failure code. @param message - Safe message. @returns Whether the failure was a lost authority. */
function hideInaccessibleSettings(controls: SettingsControls, code: AdmissionErrorCode, message: string): boolean {
  if (code !== ADMISSION_ERROR_CODE.authenticationRequired && code !== ADMISSION_ERROR_CODE.permissionDenied && code !== ADMISSION_ERROR_CODE.resourceUnavailable) return false;
  controls.setPrivateVisible(false); controls.setFresh(false); controls.setConfirmed(false); controls.setCanRetry(false);
  controls.setStatus(null); controls.setProgress(null); controls.setError(message);
  return true;
}

/** Updates render state and the synchronous original-command guard together. @param controls - Stable controls. @param input - Original command, or null once released. @returns Nothing. */
function rememberSettingsIntent(controls: SettingsControls, input: AdmissionNotificationEmailSettingsCommand | null): void {
  controls.pending.current = input; controls.setHasPending(input !== null);
}

/** Applies a saved or freshly read email to the editable fields. @param controls - Stable controls. @param value - Email settings. @returns Nothing. */
export function resetSettingsEmailDraft(controls: SettingsControls, value: AdmissionNotificationEmailSettingsView | null): void {
  controls.setDraft(draftFromEmail(value)); controls.zoneEdited.current = false;
}

/** Restores a checked viewer's local command once; role checks still gate privileged recovery and never delete inaccessible storage. @param session - Current route session. @returns Nothing. */
function restoreSettingsEmailIntent({ ready, controls }: SettingsSession): void {
  if (controls.loaded.current) return;
  const stored = readAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug); controls.loaded.current = true; rememberSettingsIntent(controls, stored);
  if (stored) controls.setDraft({ enabled: stored.enabled, timeZone: stored.timeZone });
}

/** Samples native identity before storage and after asynchronous replies; cancellation wins over feedback. @param session - Current route session. @param signal - Signal of the work. @returns Whether the same viewer is still current. */
async function checkSettingsViewer({ ready, client, controls }: SettingsSession, signal: AbortSignal): Promise<boolean> {
  if (!isSlotCurrent(controls, signal)) return false;
  const viewer = await client.viewer(signal);
  if (!isSlotCurrent(controls, signal) || viewer.status === STATUS.aborted) return false;
  if (viewer.status === STATUS.failed) { controls.setPrivateVisible(false); controls.setFresh(false); controls.setError(viewer.message); return false; }
  if (viewer.value?.id !== ready.viewerId) { controls.setPrivateVisible(false); controls.setFresh(false); controls.setPhase(PHASE.changedViewer); return false; }
  return true;
}

/** @param session - Current route session. @param signal - Signal of the work. @returns Whether the reply may be applied: the slot is still current and the viewer was checked again. */
async function isReplyCurrent(session: SettingsSession, signal: AbortSignal): Promise<boolean> {
  return isSlotCurrent(session.controls, signal) && await checkSettingsViewer(session, signal) && isSlotCurrent(session.controls, signal);
}

/** Rejects a response actually produced for a different viewer, including a rapid account switch. @param session - Current route session. @param value - Bound reply. @param signal - Signal of the work. @returns Whether the reply belongs to the current viewer and slot. */
async function acceptSettingsResult(session: SettingsSession, value: AdmissionNotificationSettingsBoundResult<unknown>, signal: AbortSignal): Promise<boolean> {
  const { ready, controls } = session;
  if (!isSlotCurrent(controls, signal)) return false;
  if (value.viewerId !== ready.viewerId) { controls.setPrivateVisible(false); controls.setFresh(false); controls.setPhase(PHASE.changedViewer); return false; }
  const accepted = await checkSettingsViewer(session, signal);
  return isSlotCurrent(controls, signal) && accepted;
}

/** @param session - Current route session. @param signal - Current read. @returns Whether the viewer may configure the tribe email now, or null when the read stops. */
async function readCurrentPreference(session: SettingsSession, signal: AbortSignal): Promise<boolean | null> {
  const { ready, client, controls } = session;
  const currentPreference = await client.readPreference(ready.slug, signal);
  if (currentPreference.status === STATUS.aborted || !await isReplyCurrent(session, signal)) return null;
  if (currentPreference.status === STATUS.failed) { controls.setPrivateVisible(false); controls.setError(currentPreference.message); return null; }
  if (!await acceptSettingsResult(session, currentPreference.value, signal) || !isSlotCurrent(controls, signal)) return null;
  const current = currentPreference.value.data.preference;
  controls.setPreference(current);
  if (!controls.modeEdited.current) controls.setMode(draftModeFor(current));
  return currentPreference.value.data.canConfigureEmail;
}

/** Outcome of consulting a stored original: the read stops, or continues knowing whether it was recovered. */
type EmailRecoveryOutcome = { stop: true } | { stop: false; recovered: boolean; succeeded: boolean };

/** @param session - Current route session. @param original - Stored original command. @param signal - Current read. @returns Whether the read stops, and whether the original was recovered and saved. */
async function recoverEmailOriginal(session: SettingsSession, original: AdmissionNotificationEmailSettingsCommand, signal: AbortSignal): Promise<EmailRecoveryOutcome> {
  const { ready, client, controls } = session;
  const result = await client.operation(ready.slug, original.operationId, signal);
  if (result.status === STATUS.aborted || !await isReplyCurrent(session, signal)) return { stop: true };
  if (result.status !== STATUS.ready) {
    if (result.code !== ADMISSION_ERROR_CODE.resourceUnavailable) { controls.setPrivateVisible(false); controls.setError(result.message); return { stop: true }; }
    controls.setCanRetry(true); controls.setError(COPY.originalAbsent);
    return { stop: false, recovered: false, succeeded: false };
  }
  if (!await acceptSettingsResult(session, result.value, signal) || !isSlotCurrent(controls, signal)) return { stop: true };
  if (result.value.data.state === OPERATION_STATE.started) { controls.setCanRetry(true); controls.setError(COPY.originalStarted); return { stop: false, recovered: false, succeeded: false }; }
  const terminal = result.value.data.result;
  writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); rememberSettingsIntent(controls, null);
  if (terminal.status === EMAIL_STATUS.rejected) { controls.setError(ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY[terminal.reason]); return { stop: false, recovered: true, succeeded: false }; }
  controls.setError(null);
  return { stop: false, recovered: true, succeeded: true };
}

/** @param session - Current route session. @param signal - Current read. @returns The recovery of the stored original, or a continuing read without one. */
async function recoverStoredEmail(session: SettingsSession, signal: AbortSignal): Promise<EmailRecoveryOutcome> {
  const original = session.controls.pending.current;
  return original ? recoverEmailOriginal(session, original, signal) : { stop: false, recovered: false, succeeded: false };
}

/** @param controls - Stable controls. @param recovered - Whether to announce a recovered or reset state. @returns Nothing after showing the current settings. */
function finishSettingsRead(controls: SettingsControls, recovered: boolean): void {
  // A retained original opens the steps on the review, where its retry needs one fresh confirmation.
  if (controls.pending.current) { controls.setEditing(true); controls.setStep(REVIEW_STEP_INDEX); }
  controls.setPrivateVisible(true); controls.setFresh(true);
  if (recovered) controls.setStatus(COPY.recovered);
}

/** @param session - Current route session. @param signal - Current read. @param resetDraft - Whether the fields follow the read email. @returns Whether the current email was read and applied. */
async function readCurrentEmail(session: SettingsSession, signal: AbortSignal, resetDraft: boolean): Promise<boolean> {
  const { ready, client, controls } = session;
  const currentEmail = await client.readEmail(ready.slug, signal);
  if (currentEmail.status === STATUS.aborted || !await isReplyCurrent(session, signal)) return false;
  if (currentEmail.status === STATUS.failed) { controls.setPrivateVisible(false); controls.setError(currentEmail.message); return false; }
  if (!await acceptSettingsResult(session, currentEmail.value, signal) || !isSlotCurrent(controls, signal)) return false;
  const initializeDraft = !controls.hasEmailView.current; controls.hasEmailView.current = true; controls.setEmail(currentEmail.value.data);
  if (resetDraft || initializeDraft && !controls.pending.current) resetSettingsEmailDraft(controls, currentEmail.value.data);
  return true;
}

/** Retains inaccessible privileged storage for its original account; personal preferences remain independent. @param controls - Stable controls. @returns Nothing after showing only the personal preference. */
function showPreferenceOnly(controls: SettingsControls): void {
  rememberSettingsIntent(controls, null); controls.loaded.current = false; controls.hasEmailView.current = false; controls.setEmail(null);
  controls.setPrivateVisible(true); controls.setFresh(true);
}

/** Recovers an immutable original first, then reads current state without applying an historical version over it. @param session - Current route session. @param signal - Current read. @param options - Whether this is the first read and whether the fields follow the read email. @returns Whether the current state was read completely. */
export async function readSettingsCurrent(session: SettingsSession, signal: AbortSignal, { initial = false, resetEmailDraft: resetDraft = false }: ReadOptions = {}): Promise<boolean> {
  const { ready, controls } = session;
  if (!isSlotCurrent(controls, signal)) return false;
  controls.setPhase(PHASE.reading); controls.setFresh(false); controls.setConfirmed(false); controls.setCanRetry(false);
  try {
    if (!await checkSettingsViewer(session, signal) || !isSlotCurrent(controls, signal)) return false;
    let canConfigureEmail: boolean | null = ready.canConfigureEmail;
    if (initial && canConfigureEmail) restoreSettingsEmailIntent(session);
    const needsCurrent = !initial || controls.pending.current !== null;
    if (needsCurrent) canConfigureEmail = await readCurrentPreference(session, signal);
    if (canConfigureEmail === null) return false;
    if (!canConfigureEmail) { showPreferenceOnly(controls); return true; }
    restoreSettingsEmailIntent(session);
    const recovery = await recoverStoredEmail(session, signal);
    if (recovery.stop) return false;
    if ((needsCurrent || controls.pending.current || recovery.recovered) && !await readCurrentEmail(session, signal, recovery.recovered || resetDraft)) return false;
    finishSettingsRead(controls, recovery.succeeded || resetDraft);
    return true;
  } catch { if (isSlotCurrent(controls, signal)) { controls.loaded.current = false; controls.setError(COPY.storageFailed); } return false; }
  finally { if (isSlotCurrent(controls, signal)) controls.setPhase((current) => settledSettingsPhase(current, controls.pending.current)); }
}

/** @param session - Current route session. @param result - Failed email write. @returns Nothing after explaining it; a definite failure releases the original so the same save can run again. */
function failEmailWrite({ ready, controls }: SettingsSession, result: { code: AdmissionErrorCode; message: string; uncertain: boolean }): void {
  if (hideInaccessibleSettings(controls, result.code, result.message)) return;
  controls.setError(result.message);
  if (result.code === ADMISSION_ERROR_CODE.reauthenticationRequired) { controls.setCanRetry(true); controls.setFresh(true); }
  // A definite failure applied nothing: the original is released and the same save can run again.
  else if (!result.uncertain) { writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); rememberSettingsIntent(controls, null); controls.setFresh(true); }
}

/** @param writer - Current route session. @param operation - Terminal email operation. @param signal - Current write. @returns Whether the tribe email is confirmed saved, after releasing the original. */
async function applyEmailTerminal(writer: SettingsWriter, operation: Extract<AdmissionNotificationEmailSettingsOperationResult, { state: "completed" }>, signal: AbortSignal): Promise<boolean> {
  const { ready, controls } = writer, terminal = operation.result;
  writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, null); rememberSettingsIntent(controls, null);
  if (terminal.status === EMAIL_STATUS.rejected) { const message = ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY[terminal.reason]; controls.setError(message); toast.error(message); return false; }
  // A replay answers with historical settings; only an independent current read may update the fields.
  if (operation.replayed) return await writer.readCurrent(signal, { resetEmailDraft: true }) && isSlotCurrent(controls, signal);
  controls.setEmail(terminal.settings); resetSettingsEmailDraft(controls, terminal.settings);
  return true;
}

/** Persists before transport and retains the same original body through uncertainty or a legacy session-change answer. @param writer - Current route session. @param input - Original command. @param signal - Current write. @returns Whether the tribe email is confirmed saved. */
async function writeEmailSettings(writer: SettingsWriter, input: AdmissionNotificationEmailSettingsCommand, signal: AbortSignal): Promise<boolean> {
  const { ready, client, controls } = writer;
  let dispatched = false;
  try {
    writeAdmissionNotificationSettingsIntent(ready.viewerId, ready.slug, input); rememberSettingsIntent(controls, input); dispatched = true;
    const result = await client.changeEmail(ready.slug, input, signal);
    if (result.status === STATUS.aborted || !await isReplyCurrent(writer, signal)) return false;
    if (result.status === STATUS.failed) { failEmailWrite(writer, result); return false; }
    if (!await acceptSettingsResult(writer, result.value, signal) || !isSlotCurrent(controls, signal)) return false;
    if (result.value.data.state === OPERATION_STATE.started) { controls.setError(COPY.uncertain); toast.info(COPY.uncertain); return false; }
    return await applyEmailTerminal(writer, result.value.data, signal);
  } catch {
    if (isSlotCurrent(controls, signal)) { if (!dispatched) controls.loaded.current = false; controls.setError(dispatched ? COPY.uncertain : COPY.storageFailed); }
    return false;
  }
}

/** Saves only the current recipient's CAS choice; lost replies require a read instead of an automatic retry. @param session - Current route session. @param change - Preference change. @param signal - Current write. @returns Whether the preference is confirmed saved. */
async function writePreferenceSettings(session: SettingsSession, change: AdmissionNotificationPreferenceChange, signal: AbortSignal): Promise<boolean> {
  const { ready, client, controls } = session;
  try {
    const result = await client.changePreference(ready.slug, change, signal);
    if (result.status === STATUS.aborted || !await isReplyCurrent(session, signal)) return false;
    if (result.status === STATUS.failed) {
      if (hideInaccessibleSettings(controls, result.code, result.message)) return false;
      controls.setError(result.uncertain ? COPY.preferenceUncertain : result.message);
      if (!result.uncertain) controls.setFresh(true);
      return false;
    }
    if (!await acceptSettingsResult(session, result.value, signal) || !isSlotCurrent(controls, signal)) return false;
    if (result.value.data.status === PREFERENCE_STATUS.rejected) { controls.setError(COPY.preferenceConflict); toast.error(COPY.preferenceConflict); return false; }
    controls.setPreference(result.value.data.preference); controls.setMode(result.value.data.preference.mode); controls.modeEdited.current = false;
    return true;
  } catch { if (isSlotCurrent(controls, signal)) controls.setError(COPY.preferenceUncertain); return false; }
}

/** @param controls - Stable controls. @param view - Values on screen. @param emailPlan - What the save does with the tribe email. @returns The email command to write, null when nothing changes, or undefined when the draft is invalid. */
function emailCommandFor(controls: SettingsControls, { email, draft }: SettingsSaveView, emailPlan: ReturnType<typeof emailPlanFor>): AdmissionNotificationEmailSettingsCommand | null | undefined {
  if (emailPlan === EMAIL_PLAN.retry) return controls.pending.current;
  if (emailPlan !== EMAIL_PLAN.save || !email) return null;
  const parsed = admissionNotificationEmailSettingsCommandSchema.safeParse({ enabled: draft.enabled, timeZone: emailTimeZoneFor(email, draft), operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: email.version });
  return parsed.success ? parsed.data : undefined;
}

/** @param writer - Current route session. @param emailInput - Email command, if any. @param preferenceChange - Preference change, if any. @param signal - Current write. @returns Whether every planned write was confirmed, after reporting what stayed saved. */
async function runSettingsWrites(writer: SettingsWriter, emailInput: AdmissionNotificationEmailSettingsCommand | null, preferenceChange: AdmissionNotificationPreferenceChange | null, signal: AbortSignal): Promise<boolean> {
  const { controls } = writer;
  if (emailInput) {
    controls.setSaving(SAVE_STEP.email);
    if (!await writeEmailSettings(writer, emailInput, signal)) { if (preferenceChange && isSlotCurrent(controls, signal)) controls.setProgress(COPY.preferencePending); return false; }
  }
  if (preferenceChange) {
    controls.setSaving(SAVE_STEP.preference); controls.setPhase(PHASE.writing);
    if (!await writePreferenceSettings(writer, preferenceChange, signal)) { if (emailInput && isSlotCurrent(controls, signal)) controls.setProgress(COPY.emailSavedPreferencePending); return false; }
  }
  return true;
}

/** Writes only what changed, the tribe email first, in one request slot; a failure reports what stayed saved and stops the chain. @param writer - Current route session. @param view - Values on screen. @returns Nothing after the save settles. */
export async function saveNotificationSettings(writer: SettingsWriter, view: SettingsSaveView): Promise<void> {
  const { controls } = writer, { preference, email, draft, mode, confirmed, fresh, canRetry } = view;
  if (!preference || !fresh || controls.busy.current) return;
  // Consent comes before a new operation id exists; a retained original keeps its own id.
  if (email !== null && !confirmed) return;
  const emailPlan = emailPlanFor({ email, draft, pending: controls.pending.current !== null, canRetry });
  const preferenceChange = hasPreferenceChange(preference, mode) ? { mode, expectedVersion: preference.version } : null;
  const emailInput = emailCommandFor(controls, view, emailPlan);
  if (emailInput === undefined) { controls.setError(COPY.invalid); return; }
  if (!emailInput && !preferenceChange) return;
  controls.busy.current = true; controls.slot.current?.abort(); const controller = new AbortController(); controls.slot.current = controller; const { signal } = controller;
  controls.setPhase(PHASE.writing); controls.setFresh(false); controls.setConfirmed(false); controls.setCanRetry(false); controls.setError(null); controls.setStatus(null); controls.setProgress(null);
  try {
    if (!await checkSettingsViewer(writer, signal) || !isSlotCurrent(controls, signal)) return;
    if (!await runSettingsWrites(writer, emailInput, preferenceChange, signal) || !isSlotCurrent(controls, signal)) return;
    controls.setFresh(true); controls.setEditing(false); controls.setStep(0); controls.setStatus(COPY.saved); toast.success(COPY.saved);
  } finally {
    controls.setSaving(null);
    if (controls.slot.current === controller) controls.busy.current = false;
    if (isSlotCurrent(controls, signal)) controls.setPhase((current) => settledSettingsPhase(current, controls.pending.current));
  }
}
