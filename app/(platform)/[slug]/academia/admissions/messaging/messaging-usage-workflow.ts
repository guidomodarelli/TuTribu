/** Reads, recovers and writes the messaging usage configuration for the usage container, through its stable state controls. @module messaging-usage-workflow */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { MessagingUsagePageState } from "@/src/modules/messaging/application/results/messaging-usage-page-state";
import type { MessagingUsageBrowserClient, MessagingUsageBrowserResult } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type { MessagingUsageDraft } from "@/src/modules/messaging/application/commands/messaging-usage-draft";
import type { MessagingErrorCode } from "@/src/modules/messaging/application/results/messaging-errors";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { createMessagingUsageDraft, messagingUsageBrowserIntentSchema, type MessagingUsageBrowserIntent } from "@/src/modules/messaging/application/commands/messaging-usage-browser-intent";
import { messagingUsagePolicyStateSchema, type MessagingUsagePolicyDto, type MessagingUsagePolicyStateDto } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { readMessagingUsageIntent, writeMessagingUsageIntent } from "@/lib/messaging/messaging-usage-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { MESSAGING_USAGE_BROWSER_PHASE as PHASE, MESSAGING_USAGE_UI_COPY as COPY, MESSAGING_USAGE_RECOVERABLE_OPERATION as OPERATION, MESSAGING_USAGE_PRIVATE_AUTHORITY_FAILURES, MESSAGING_USAGE_INTENT_KEEPING_FAILURES, MESSAGING_USAGE_STEP, MESSAGING_USAGE_STEP_ORDER, MESSAGING_USAGE_WRITE_STEP as WRITE_STEP, type MessagingUsageBrowserPhase, type MessagingUsageWriteStep } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_USAGE_POLICY_STATE } from "@/src/modules/messaging/constants/messaging-limits";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Server snapshot of a usage route the viewer may manage. */
export type MessagingUsageReady = Extract<MessagingUsagePageState, { kind: "ready" }>;
/** Normalized values the leader confirmed in the review step. */
export type MessagingUsageValues = { allowedCountries: string[]; verificationDailyLimit: number; notificationDailyLimit: number };
/** Outcome of one stored write: the confirmed policy, a reported failure, or a stop whose feedback is already shown. */
type MessagingUsageWriteOutcome = { status: "completed"; policy: MessagingUsagePolicyDto } | { status: "failed"; code: MessagingErrorCode; uncertain: boolean } | { status: "stopped" };
/** Whether a recovery consultation stops the read, recovered the original or lets the read continue. */
type UsageRecoveryOutcome = "stop" | "recovered" | "continue";

/** Stable setters and refs of the usage container; their identity never changes between renders. */
export type MessagingUsageControls = {
  setState: Dispatch<SetStateAction<MessagingUsagePolicyStateDto | null>>; setDraft: Dispatch<SetStateAction<MessagingUsageDraft | null>>;
  setPhase: Dispatch<SetStateAction<MessagingUsageBrowserPhase>>; setFresh: (value: boolean) => void; setConfirmed: (value: boolean) => void; setCanRetry: (value: boolean) => void;
  setRetryConfirmed: (value: boolean) => void; setPrivateVisible: (value: boolean) => void; setEditing: (value: boolean) => void; setStep: (value: number) => void;
  setWriteStep: (value: MessagingUsageWriteStep | null) => void; setPartialSave: (value: boolean) => void; setErrorMessage: (value: string | null) => void; setStatusMessage: (value: string | null) => void;
  /** Installs the platform requirement of the latest current read; its ref lets an asynchronous recovery see the newest value. */
  setPlatformRequirement: (value: PlatformSecurityRequirement | null) => void; platformRequirement: RefObject<PlatformSecurityRequirement | null>;
  pending: RefObject<MessagingUsageBrowserIntent | null>; loaded: RefObject<boolean>; busy: RefObject<boolean>;
  readController: RefObject<AbortController | null>; writeController: RefObject<AbortController | null>;
};

/** Current route snapshot, transport and viewer check shared by every read and write. */
export type MessagingUsageSession = { ready: MessagingUsageReady; client: MessagingUsageBrowserClient; checkViewer: (signal: AbortSignal) => Promise<boolean>; controls: MessagingUsageControls };
/** A session that can also reread the current configuration after a replayed write. */
export type MessagingUsageWriter = MessagingUsageSession & { readCurrent: (signal: AbortSignal) => Promise<void> };

const STOPPED: MessagingUsageWriteOutcome = { status: "stopped" };
const UNRESOLVED: MessagingUsageWriteOutcome = { status: "failed", code: MESSAGING_ERROR_CODE.operationUnresolved, uncertain: true };
const REVIEW_STEP_INDEX = MESSAGING_USAGE_STEP_ORDER.indexOf(MESSAGING_USAGE_STEP.review);
/** First guided step. */
export const FIRST_STEP_INDEX = 0;

/** @param policy - Configuration just created. @param values - Values the leader confirmed. @returns True when the created configuration already holds them, so no second write is needed. */
function holdsValues(policy: MessagingUsagePolicyDto, values: MessagingUsageValues) {
  return policy.verificationDailyLimit === values.verificationDailyLimit && policy.notificationDailyLimit === values.notificationDailyLimit
    && policy.allowedCountries.length === values.allowedCountries.length && values.allowedCountries.every((country) => policy.allowedCountries.includes(country));
}

/** @param current - Phase when the work settles. @param pending - Original command still stored, if any. @returns A changed viewer as is; otherwise uncertain while an original is pending, or idle. */
function settledUsagePhase(current: MessagingUsageBrowserPhase, pending: MessagingUsageBrowserIntent | null): MessagingUsageBrowserPhase {
  if (current === PHASE.changedViewer) return current;
  return pending ? PHASE.uncertain : PHASE.idle;
}

/** @param values - Countries and quotas the leader chose. @returns Them as an editable draft. */
function draftOf(values: MessagingUsageValues): MessagingUsageDraft {
  return { allowedCountries: [...values.allowedCountries], verificationDailyLimit: String(values.verificationDailyLimit), notificationDailyLimit: String(values.notificationDailyLimit) };
}

/** @param intent - Stored original command. @returns The values the leader chose with it: an update sends them, an initialization keeps them for the update that follows. */
function chosenValuesOf(intent: MessagingUsageBrowserIntent): MessagingUsageValues | null {
  return intent.type === OPERATION.update ? intent.input : intent.chosen ?? null;
}

/** @param controls - Stable controls. @param values - Values chosen before the response was lost. @returns Nothing after reopening the review step with them. */
function reopenChosenValues(controls: MessagingUsageControls, values: MessagingUsageValues): void {
  controls.setDraft(draftOf(values)); controls.setEditing(true); controls.setStep(REVIEW_STEP_INDEX);
}

/** @param session - Current route session. @returns Nothing after loading the stored original once and reopening the review step with the values chosen with it. */
function restoreStoredUsageIntent({ ready, controls }: MessagingUsageSession): void {
  if (controls.loaded.current) return;
  controls.pending.current = readMessagingUsageIntent(ready.viewerId, ready.slug); controls.loaded.current = true;
  const chosen = controls.pending.current ? chosenValuesOf(controls.pending.current) : null;
  if (chosen) reopenChosenValues(controls, chosen);
}

/**
 * A confirmed initialization only created the configuration with the server defaults: the values the leader chose still have
 * to be saved, so the editor stays open with them instead of announcing the save as done.
 * @param controls - Stable controls. @param intent - Recovered initialization. @returns Nothing after showing what is left.
 */
function settleRecoveredInitialization(controls: MessagingUsageControls, intent: Extract<MessagingUsageBrowserIntent, { type: typeof OPERATION.initialize }>): void {
  if (intent.chosen) { reopenChosenValues(controls, intent.chosen); controls.setPartialSave(true); return; }
  controls.setStatusMessage(COPY.initialized); controls.setEditing(true); controls.setStep(FIRST_STEP_INDEX);
}

/** @param session - Current route session. @returns Nothing after removing the stored original from storage and memory. */
function forgetUsageIntent({ ready, controls }: MessagingUsageSession): void {
  writeMessagingUsageIntent(ready.viewerId, ready.slug, null); controls.pending.current = null;
}

/** @param session - Current route session. @param intent - Stored original command. @param signal - Current read. @returns Whether the read stops, recovered the original or continues to the current configuration. */
async function recoverUsageOriginal(session: MessagingUsageSession, intent: MessagingUsageBrowserIntent, signal: AbortSignal): Promise<UsageRecoveryOutcome> {
  const { ready, client, checkViewer, controls } = session;
  controls.setPrivateVisible(false);
  const original = await client.operation(ready.slug, intent.input.operationId, signal);
  if (signal.aborted || original.status === "aborted") return "stop";
  if (!await checkViewer(signal) || signal.aborted) return "stop";
  if (original.status === "ready") {
    if (original.value.type !== intent.type || original.value.operationId !== intent.input.operationId) { controls.setErrorMessage(COPY.uncertain); return "stop"; }
    // Registered but not finished (its effect rolled back or is still running): the current usage stays visible and the same original
    // can be resent, which the ledger reclaims once nobody works on it.
    if (original.value.state !== "completed") { controls.setCanRetry(true); controls.setErrorMessage(COPY.started); return "continue"; }
    forgetUsageIntent(session);
    if (intent.type === OPERATION.initialize) { settleRecoveredInitialization(controls, intent); return "recovered"; }
    controls.setStatusMessage(COPY.recovered);
    controls.setEditing(false); controls.setPartialSave(false); controls.setStep(FIRST_STEP_INDEX);
    return "recovered";
  }
  if (original.code === MESSAGING_ERROR_CODE.resourceUnavailable) {
    // While the platform cannot protect a save, an unregistered original can never be retried: forget it instead.
    if (controls.platformRequirement.current) { forgetUsageIntent(session); controls.setStatusMessage(COPY.platformForgotten); return "continue"; }
    controls.setCanRetry(true); controls.setErrorMessage(COPY.retry); return "continue";
  }
  controls.setErrorMessage(original.message);
  return "stop";
}

/** @param session - Current route session. @param signal - Current read. @returns Whether the current configuration and the platform requirement of its saves were read and installed. */
async function readUsageConfiguration({ ready, client, checkViewer, controls }: MessagingUsageSession, signal: AbortSignal): Promise<boolean> {
  const current = await client.read(ready.slug, signal);
  if (signal.aborted || current.status === "aborted") return false;
  if (!await checkViewer(signal) || signal.aborted) return false;
  if (current.status === "failed") { controls.setErrorMessage(current.message); return false; }
  // The same read lifts or imposes the platform block, so a resolved requirement re-enables saving without reloading the page.
  controls.setState(current.value.usage); controls.setPlatformRequirement(current.value.platformRequirement);
  if (!current.value.usage.policy) controls.setEditing(true);
  return true;
}

/** Reads original work before current configuration; recovery never installs an historical version as today's state. @param session - Current route session. @param signal - Current read. @param initial - Whether this is the first read after mounting. @returns Nothing after settling the phase. */
export async function readUsageCurrent(session: MessagingUsageSession, signal: AbortSignal, initial = false): Promise<void> {
  const controls = session.controls;
  if (signal.aborted) return;
  if (!initial) controls.setPrivateVisible(false);
  controls.setPhase(PHASE.reading); controls.setFresh(false); controls.setConfirmed(false); controls.setRetryConfirmed(false); controls.setCanRetry(false);
  let recovered = false;
  try {
    if (!await session.checkViewer(signal) || signal.aborted) return;
    restoreStoredUsageIntent(session);
    if (controls.pending.current) {
      const recovery = await recoverUsageOriginal(session, controls.pending.current, signal);
      if (recovery === "stop") return;
      recovered = recovery === "recovered";
    }
    if ((!initial || recovered || controls.pending.current) && !await readUsageConfiguration(session, signal)) return;
    controls.setFresh(true); controls.setPrivateVisible(true);
  } catch { if (!signal.aborted) controls.setErrorMessage(COPY.storageFailed); }
  finally { if (!signal.aborted) controls.setPhase((current) => settledUsagePhase(current, controls.pending.current)); }
}

/**
 * @param session - Current route session.
 * @param result - Failed write answer.
 * @returns The failure, or a stop when private authority was lost. A definitive rejection registered nothing, so its stored
 * original is forgotten before any other outcome; only a session answer keeps it so signing in again can still recover it.
 */
function usageWriteFailure(session: MessagingUsageSession, result: Extract<MessagingUsageBrowserResult<unknown>, { status: "failed" }>): MessagingUsageWriteOutcome {
  const { controls } = session;
  controls.setErrorMessage(result.message);
  if (!result.uncertain && !MESSAGING_USAGE_INTENT_KEEPING_FAILURES.includes(result.code)) forgetUsageIntent(session);
  if (MESSAGING_USAGE_PRIVATE_AUTHORITY_FAILURES.includes(result.code)) { controls.setPrivateVisible(false); controls.setCanRetry(false); return STOPPED; }
  return { status: "failed", code: result.code, uncertain: controls.pending.current !== null };
}

/** @param intent - Written command. @param base - Configuration an update expects. @param policy - Confirmed configuration. @returns Whether an update answer does not follow from the configuration it started from. */
function isUnexpectedUpdate(intent: MessagingUsageBrowserIntent, base: MessagingUsagePolicyDto | null, policy: MessagingUsagePolicyDto): boolean {
  if (intent.type !== OPERATION.update) return false;
  return base?.version !== intent.input.expectedVersion || policy.version < base.version || policy.version > base.version + 1;
}

/**
 * Stores the immutable command before posting and checks the answer against the configuration it starts from.
 * @param writer - Current route session.
 * @param intent - Validated original command.
 * @param signal - Signal of the active write session.
 * @param base - Configuration an update expects; null for initialization.
 * @returns The confirmed policy, a reported failure, or a stop whose feedback is already shown.
 */
async function writeUsageIntent(writer: MessagingUsageWriter, intent: MessagingUsageBrowserIntent, signal: AbortSignal, base: MessagingUsagePolicyDto | null): Promise<MessagingUsageWriteOutcome> {
  const { ready, client, checkViewer, controls } = writer;
  writeMessagingUsageIntent(ready.viewerId, ready.slug, intent); controls.pending.current = intent;
  const result = intent.type === OPERATION.initialize ? await client.initialize(ready.slug, intent.input, signal) : await client.update(ready.slug, intent.input, signal);
  if (signal.aborted || result.status === "aborted") return STOPPED;
  if (!await checkViewer(signal) || signal.aborted) return STOPPED;
  if (result.status === "failed") return usageWriteFailure(writer, result);
  if (result.value.operationId !== intent.input.operationId) { controls.setErrorMessage(COPY.uncertain); return UNRESOLVED; }
  if (result.value.state !== "completed") { controls.setErrorMessage(COPY.startedWrite); return UNRESOLVED; }
  if (result.value.replayed) { await writer.readCurrent(signal); return STOPPED; }
  const projected = messagingUsagePolicyStateSchema.parse({ state: MESSAGING_USAGE_POLICY_STATE.configured, policy: result.value.result });
  if (!projected.policy) return STOPPED;
  if (isUnexpectedUpdate(intent, base, projected.policy)) { controls.setErrorMessage(COPY.uncertain); return UNRESOLVED; }
  controls.setState(projected);
  forgetUsageIntent(writer);
  return { status: "completed", policy: projected.policy };
}

/** Runs one exclusive, cancellable write session; reads cannot replace it and its phase settles to idle or uncertain. @param session - Current route session. @param work - Writes of this session. @returns Nothing after settling the phase. */
async function runUsageWriteSession({ checkViewer, controls }: MessagingUsageSession, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
  if (controls.busy.current) return;
  controls.busy.current = true; controls.readController.current?.abort(); const controller = new AbortController(); controls.writeController.current = controller;
  controls.setPhase(PHASE.writing); controls.setFresh(false); controls.setCanRetry(false); controls.setRetryConfirmed(false); controls.setErrorMessage(null); controls.setStatusMessage(null);
  try {
    if (!await checkViewer(controller.signal) || controller.signal.aborted) return;
    await work(controller.signal);
  } catch { if (!controller.signal.aborted) controls.setErrorMessage(COPY.storageFailed); }
  finally {
    controls.setWriteStep(null);
    if (controls.writeController.current === controller) controls.busy.current = false;
    if (!controller.signal.aborted) controls.setPhase((current) => settledUsagePhase(current, controls.pending.current));
  }
}

/** Announces only a configuration the server confirmed, then returns to the summary. @param controls - Stable controls. @param policy - Confirmed configuration. @returns Nothing. */
function finishUsageSave(controls: MessagingUsageControls, policy: MessagingUsagePolicyDto): void {
  controls.setFresh(true); controls.setConfirmed(false); controls.setPartialSave(false); controls.setEditing(false); controls.setStep(FIRST_STEP_INDEX);
  controls.setDraft(createMessagingUsageDraft({ state: MESSAGING_USAGE_POLICY_STATE.configured, policy }));
  controls.setStatusMessage(COPY.saved);
}

/**
 * Saves the confirmed values; without a configuration it first creates one with the server defaults and then updates it.
 * @param writer - Current route session.
 * @param currentPolicy - Configuration shown when the leader confirmed.
 * @param values - Values confirmed in the review step.
 * @returns Nothing after the write session settles.
 */
export function saveUsageValues(writer: MessagingUsageWriter, currentPolicy: MessagingUsagePolicyDto | null, values: MessagingUsageValues): Promise<void> {
  const controls = writer.controls;
  return runUsageWriteSession(writer, async (signal) => {
    controls.setPartialSave(false);
    let base = currentPolicy, created = false;
    try {
      if (!base) {
        controls.setWriteStep(WRITE_STEP.creating);
        // The chosen values travel next to the initialization (never sent with it), so a lost response can still reopen them.
        const initialization = await writeUsageIntent(writer, messagingUsageBrowserIntentSchema.parse({ type: OPERATION.initialize, input: { operationId: newAdmissionOperationId(), confirmed: true }, chosen: values }), signal, null);
        if (initialization.status !== "completed") return;
        base = initialization.policy; created = true;
        if (holdsValues(base, values)) { finishUsageSave(controls, base); return; }
      }
      controls.setWriteStep(WRITE_STEP.saving);
      const saved = await writeUsageIntent(writer, messagingUsageBrowserIntentSchema.parse({ type: OPERATION.update, input: { operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: base.version, ...values } }), signal, base);
      if (saved.status === "completed") { finishUsageSave(controls, saved.policy); return; }
      if (!created || saved.status !== "failed") return;
      controls.setPartialSave(true);
      /** The created configuration is current unless the answer proves a concurrent change, so a certain failure may be retried right away. */
      if (!saved.uncertain && saved.code !== MESSAGING_ERROR_CODE.usagePolicyConflict) controls.setFresh(true);
    } catch (error) { if (created) controls.setPartialSave(true); throw error; }
  });
}

/** Repeats the stored original command with its own identity; it never creates a new operation while the original is uncertain. @param writer - Current route session. @param currentPolicy - Configuration shown now. @param intent - Stored original command. @returns Nothing after the write session settles. */
export function retryUsageOriginal(writer: MessagingUsageWriter, currentPolicy: MessagingUsagePolicyDto | null, intent: MessagingUsageBrowserIntent): Promise<void> {
  return runUsageWriteSession(writer, async (signal) => {
    const outcome = await writeUsageIntent(writer, intent, signal, currentPolicy);
    if (outcome.status !== "completed") return;
    if (intent.type === OPERATION.update) { finishUsageSave(writer.controls, outcome.policy); return; }
    writer.controls.setFresh(true);
    if (intent.chosen) { reopenChosenValues(writer.controls, intent.chosen); writer.controls.setPartialSave(true); }
    else writer.controls.setStatusMessage(COPY.initialized);
  });
}
