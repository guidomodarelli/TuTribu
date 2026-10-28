/** Explicit notification recovery observations and their pure view facts, driven by the container's current render state. @module notification-recovery-actions */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { MessagingConfigurationConnection } from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type { NotificationDeliveryCatalogItem, NotificationDeliveryCatalogResult } from "@/src/modules/messaging/application/results/notification-delivery-catalog-result";
import type { NotificationRecoveryBrowserClient } from "@/src/modules/messaging/application/ports/notification-recovery-browser-client";
import type { NotificationRecoveryIntentStore, NotificationRecoveryReference } from "@/src/modules/messaging/application/ports/notification-recovery-intent-store";
import type { NotificationDeliveryRecoveryResult } from "@/src/modules/messaging/application/results/notification-delivery-recovery-result";
import type { NotificationRecoveryOperationResult } from "@/src/modules/messaging/application/results/notification-recovery-operation-result";
import type { MessagingUsageBrowserResult } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { NOTIFICATION_RECOVERY_UI_COPY as COPY, NOTIFICATION_RECOVERY_WRITE_ACTION as WRITE_ACTION, type NotificationRecoveryWriteAction } from "@/src/modules/messaging/constants/notification-recovery-ui";
import { NOTIFICATION_DELIVERY_RECOVERY_AUDIT } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_PUBLIC_CHANNEL, MESSAGING_CAPABILITY_PUBLIC_STATE } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { NOTIFICATION_RECOVERY_HISTORY_LIMIT } from "@/src/modules/messaging/constants/notification-recovery-intent";

/** Safe feedback shown beside the recovery. */
export type RecoveryMessage = { kind: "status" | "alert"; text: string };

/** Current render facts, refs and setters that every explicit observation reads; it grants no authority. */
export type NotificationRecoveryContext = {
  slug: string; viewerId: string; target: MessagingConfigurationConnection | null;
  client: NotificationRecoveryBrowserClient; store: NotificationRecoveryIntentStore;
  verifyViewer: (signal: AbortSignal) => Promise<boolean>; onBusyChange: (busy: boolean) => void;
  catalog: NotificationDeliveryCatalogResult | null; selected: NotificationDeliveryCatalogItem | undefined; selectedDeliveryId: string;
  reference: NotificationRecoveryReference | null; history: NotificationRecoveryReference[]; historyFull: boolean;
  canRead: boolean; confirmed: boolean; mayResume: boolean; canArchive: boolean; archiveConfirmed: boolean; originalCompleted: boolean; busy: boolean; targetPrepared: boolean;
  mounted: RefObject<boolean>; observation: RefObject<AbortController | null>; originalReference: RefObject<NotificationRecoveryReference | null>;
  setCatalog: Dispatch<SetStateAction<NotificationDeliveryCatalogResult | null>>; setSelectedDeliveryId: (value: string | null) => void;
  setReference: (value: NotificationRecoveryReference | null) => void; setHistory: (value: NotificationRecoveryReference[]) => void;
  setStorageAvailable: (value: boolean) => void; setViewerAvailable: (value: boolean) => void; setBusy: (value: boolean) => void;
  setWriteAction: (value: NotificationRecoveryWriteAction | null) => void; setMayResume: (value: boolean) => void; setOriginalCompleted: (value: boolean) => void;
  setCanArchive: (value: boolean) => void; setArchiveConsent: (value: { checked: boolean; operationId: string } | null) => void; setClockMs: (value: number) => void;
  setConfirmed: (value: boolean) => void; setMessage: (value: RecoveryMessage | null) => void;
};

/** Reads the clock when the user acts; React's purity rule only allows `Date.now()` outside render, and this runs in a handler. @returns Current time in milliseconds. */
function readCurrentTimeMs(): number {
  return Date.now();
}

/** @param target - Current replacement connection. @returns Whether it is active with a tested prepared email capability. */
export function isRecoveryTargetPrepared(target: MessagingConfigurationConnection | null): boolean {
  return target?.state === MESSAGING_CONNECTION_STATE.active && target.capabilities.some((capability) => capability.channel === MESSAGING_PUBLIC_CHANNEL.email && capability.state === MESSAGING_CAPABILITY_PUBLIC_STATE.prepared && capability.testedAt !== null);
}

/** @param context - Current selection, target and preparation. @param now - Actual interaction time, or deterministic initial SSR time. @returns Whether current view facts permit an explicit attempt; the server still owns final authorization/eligibility. */
export function isRecoveryEligible({ selected, target, targetPrepared }: Pick<NotificationRecoveryContext, "selected" | "target" | "targetPrepared">, now: Date): boolean {
  if (!selected || !target || !targetPrepared) return false;
  if (selected.connectionId === target.id || selected.recoveryDeliveryId) return false;
  if (selected.state === MESSAGE_DELIVERY_STATE.unknown || selected.state === MESSAGE_DELIVERY_STATE.accepted || selected.state === MESSAGE_DELIVERY_STATE.delivered) return false;
  return new Date(selected.deadlineAt) > now;
}

/** @param value - Original result returned by its exact public namespace. @param original - Preserved UUID/CAS/target intent. @returns Whether the result belongs to this original reference. */
function isBoundResult(value: NotificationDeliveryRecoveryResult, original: NotificationRecoveryReference): boolean {
  return value.originalDeliveryId.toLowerCase() === original.deliveryId.toLowerCase() && value.targetConnectionId.toLowerCase() === original.targetConnectionId.toLowerCase() && value.originalVersion === original.expectedVersion + 1;
}

/** @param context - Current render facts. @param next - Metadata-only attempted original, or explicitly cleared known completion. @param deliveryId - Current selected draft resource. @param nextHistory - Preserved originals without silently dropping any identity. @returns Whether the reference is preserved before any write/navigation. */
export function preserveRecovery(context: NotificationRecoveryContext, next: NotificationRecoveryReference | null, deliveryId = context.selectedDeliveryId, nextHistory = context.history): boolean {
  const targetConnectionId = next?.targetConnectionId ?? context.target?.id;
  const saved = context.store.save(context.viewerId, context.slug, { reference: next, draft: deliveryId && targetConnectionId ? { deliveryId, targetConnectionId } : null, history: nextHistory });
  if (!saved) { context.setStorageAvailable(false); context.setMessage({ kind: "alert", text: COPY.storageUnavailable }); }
  return saved;
}

/** @param context - Current render facts. @param signal - Current observation. @returns Whether the current account still owns this result after awaited I/O. */
async function isViewerCurrent(context: NotificationRecoveryContext, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted || !context.mounted.current) return false;
  const actual = await context.verifyViewer(signal);
  if (signal.aborted || !context.mounted.current) return false;
  if (!actual) { context.setViewerAvailable(false); context.setCatalog(null); context.setConfirmed(false); context.setMessage({ kind: "alert", text: COPY.currentRequired }); }
  return actual;
}

/** @param context - Current render facts. @param controller - The observation that just settled. @returns Nothing after releasing it, when it is still the current one. */
function releaseObservation(context: NotificationRecoveryContext, controller: AbortController): void {
  if (context.observation.current !== controller) return;
  context.observation.current = null;
  if (context.mounted.current) { context.setBusy(false); context.setWriteAction(null); context.onBusyChange(false); }
}

/** @param context - Current render facts. @param work - One explicit observation using its own abort lifetime. @param write - The pressed write, when this observation records or moves an original. @returns Nothing after current-viewer checks and safe feedback; no retry or inferred rollback. */
async function observeRecovery(context: NotificationRecoveryContext, work: (signal: AbortSignal) => Promise<void>, write: NotificationRecoveryWriteAction | null = null): Promise<void> {
  if (!context.canRead || context.observation.current) return;
  const controller = new AbortController(); context.originalReference.current = context.reference; context.observation.current = controller; context.setBusy(true); context.setWriteAction(write); context.onBusyChange(true); context.setMessage(write === WRITE_ACTION.register || write === WRITE_ACTION.resume ? { kind: "status", text: COPY.registering } : null);
  try {
    if (!await isViewerCurrent(context, controller.signal)) return;
    await work(controller.signal);
  } catch { if (!controller.signal.aborted && context.mounted.current) context.setMessage({ kind: "alert", text: context.originalReference.current ? COPY.pending : MESSAGING_ERROR_MESSAGE[MESSAGING_ERROR_CODE.unexpectedFailure] }); }
  finally { releaseObservation(context, controller); }
}

/** @param previous - Catalog already shown. @param page - Newly read page. @param more - Whether the page continues the previous one. @returns Earlier notices added below the ones already shown, so the selection and the first page stay in place. */
function mergeCatalogPage(previous: NotificationDeliveryCatalogResult | null, page: NotificationDeliveryCatalogResult, more: boolean): NotificationDeliveryCatalogResult {
  if (!more || !previous) return page;
  return { items: [...new Map([...previous.items, ...page.items].map((item) => [item.id, item])).values()], nextCursor: page.nextCursor };
}

/** @param context - Current render facts. @param more - Whether to use the previous stable page cursor. @returns Nothing after updating only the owned notification projection. */
export async function readRecoveryCatalog(context: NotificationRecoveryContext, more = false): Promise<void> {
  await observeRecovery(context, async (signal) => {
    context.setMessage({ kind: "status", text: COPY.reading });
    const outcome = await context.client.catalog({ slug: context.slug, cursor: more ? context.catalog?.nextCursor ?? null : null }, signal);
    if (!await isViewerCurrent(context, signal)) return;
    if (outcome.status === "ready") { context.setClockMs(Date.now()); context.setCatalog((previous) => mergeCatalogPage(previous, outcome.value, more)); context.setConfirmed(false); if (!context.reference && !more) context.setSelectedDeliveryId(""); context.setMessage(null); }
    else if (outcome.status === "failed") context.setMessage({ kind: "alert", text: outcome.message });
  });
}

/** @param context - Current render facts. @returns Nothing after clearing every consent and original follow-up. */
function clearOriginalFollowUp(context: NotificationRecoveryContext): void {
  context.setConfirmed(false); context.setMayResume(false); context.setCanArchive(false); context.setArchiveConsent(null);
}

/** @param context - Current render facts. @param original - Exact preserved original attempt. @param signal - Current observation. @returns Nothing after one explicit POST; ambiguity retains the original. */
async function submitRecovery(context: NotificationRecoveryContext, original: NotificationRecoveryReference, signal: AbortSignal): Promise<void> {
  const outcome = await context.client.recover({ slug: context.slug, deliveryId: original.deliveryId }, { operationId: original.operationId, expectedVersion: original.expectedVersion, targetConnectionId: original.targetConnectionId, expectedTargetVersion: original.expectedTargetVersion, confirmed: true, reason: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.cause }, signal);
  if (!await isViewerCurrent(context, signal)) return;
  clearOriginalFollowUp(context);
  if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.completed && isBoundResult(outcome.value.result, original)) { context.setOriginalCompleted(true); context.setMessage({ kind: "status", text: COPY.completed }); }
  else context.setMessage({ kind: "alert", text: outcome.status === "failed" && !outcome.uncertain ? outcome.message : COPY.pending });
}

/** @param context - Current render facts. @param resume - Whether the user explicitly reuses a consulted preserved original. @returns The feedback that blocks this attempt, or null when it may proceed. */
function recoveryBlock(context: NotificationRecoveryContext, resume: boolean): RecoveryMessage | null {
  if (!context.confirmed) return { kind: "alert", text: COPY.consentRequired };
  const selectable = resume ? context.reference !== null && context.mayResume : !context.reference && isRecoveryEligible(context, new Date());
  return selectable ? null : { kind: "alert", text: COPY.selectionRequired };
}

/** @param context - Current render facts. @param resume - Whether the existing reference is reused. @returns The original to preserve before the write, or null without a complete selection. */
function recoveryOriginal(context: NotificationRecoveryContext, resume: boolean): NotificationRecoveryReference | null {
  if (resume) return context.reference;
  const { selected, target } = context;
  if (!selected || !target) return null;
  return { operationId: newAdmissionOperationId(), deliveryId: selected.id, expectedVersion: selected.version, targetConnectionId: target.id, expectedTargetVersion: target.version };
}

/** @param context - Current render facts. @param resume - Whether the user explicitly reuses a consulted preserved original. @returns Nothing after preserving UUID/CAS before a single write. */
export async function recoverNotification(context: NotificationRecoveryContext, resume = false): Promise<void> {
  if (!resume && context.historyFull) { context.setMessage({ kind: "alert", text: COPY.historyFull }); return; }
  // A deadline that passed since the last evaluation shows the notice as no longer available instead of a selection error.
  const attemptedAtMs = readCurrentTimeMs();
  if (!resume && context.selected && Date.parse(context.selected.deadlineAt) <= attemptedAtMs) { context.setClockMs(attemptedAtMs); context.setMessage(null); return; }
  const block = recoveryBlock(context, resume);
  if (block) { context.setMessage(block); return; }
  await observeRecovery(context, async (signal) => {
    const original = recoveryOriginal(context, resume);
    if (!original || !preserveRecovery(context, original)) return;
    context.originalReference.current = original; context.setReference(original); context.setOriginalCompleted(false); context.setMayResume(false); await submitRecovery(context, original, signal);
  }, resume ? WRITE_ACTION.resume : WRITE_ACTION.register);
}

/** Classifies one original consultation without changing local state. */
type OriginalConsultation = { completed: true; message: RecoveryMessage } | { completed: false; resumable: boolean; message: RecoveryMessage };

/** @param outcome - Original GET outcome. @param original - Preserved original. @returns Whether it completed, may be resumed, and the feedback to show. */
function classifyOriginalConsultation(outcome: MessagingUsageBrowserResult<NotificationRecoveryOperationResult>, original: NotificationRecoveryReference): OriginalConsultation {
  if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.completed && isBoundResult(outcome.value.result, original)) return { completed: true, message: { kind: "status", text: COPY.completed } };
  if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.started) return { completed: false, resumable: true, message: { kind: "status", text: COPY.originalStarted } };
  if (outcome.status === "failed" && outcome.code === MESSAGING_ERROR_CODE.resourceUnavailable) return { completed: false, resumable: true, message: { kind: "status", text: COPY.originalAbsent } };
  return { completed: false, resumable: false, message: { kind: "alert", text: outcome.status === "failed" ? outcome.message : COPY.pending } };
}

/** @param context - Current render facts. @returns Nothing after original GET only, without another mutation. */
export async function readRecoveryOriginal(context: NotificationRecoveryContext): Promise<void> {
  if (!context.reference) return;
  const original = context.reference;
  await observeRecovery(context, async (signal) => {
    context.setMessage({ kind: "status", text: COPY.originalReading });
    const outcome = await context.client.operation({ slug: context.slug, operationId: original.operationId }, signal);
    if (!await isViewerCurrent(context, signal)) return;
    clearOriginalFollowUp(context);
    const consultation = classifyOriginalConsultation(outcome, original);
    if (consultation.completed) context.setOriginalCompleted(true);
    else if (consultation.resumable) { context.setMayResume(true); context.setCanArchive(true); }
    context.setMessage(consultation.message);
  });
}

/** @param context - Current render facts. @returns Nothing after stopping observation only; a preserved original remains consultable. */
export function stopRecoveryObservation(context: NotificationRecoveryContext): void {
  context.observation.current?.abort(); context.observation.current = null; context.setBusy(false); context.setWriteAction(null); context.onBusyChange(false); context.setConfirmed(false); context.setMayResume(false); context.setMessage({ kind: "status", text: COPY.stopped });
}

/** @param context - Current render facts. @param reference - Original now shown, or null. @returns Nothing after resetting every consent and original follow-up for that reference. */
function showOriginal(context: NotificationRecoveryContext, reference: NotificationRecoveryReference | null): void {
  context.originalReference.current = reference; context.setReference(reference); context.setOriginalCompleted(false); context.setCanArchive(false); context.setMayResume(false); context.setConfirmed(false); context.setArchiveConsent(null);
}

/** @param context - Current render facts. @returns Nothing after explicitly preserving a consulted original in history; the backend is never cancelled or assumed rolled back. */
export async function archiveRecoveryOriginal(context: NotificationRecoveryContext): Promise<void> {
  if (!context.reference || !context.canArchive || !context.archiveConfirmed || context.originalCompleted) return;
  const original = context.reference;
  await observeRecovery(context, async () => {
    if (context.history.length >= NOTIFICATION_RECOVERY_HISTORY_LIMIT) { context.setMessage({ kind: "alert", text: COPY.historyFull }); return; }
    const next = [...context.history, original];
    if (!preserveRecovery(context, null, "", next)) return;
    context.setHistory(next); showOriginal(context, null); context.setSelectedDeliveryId(""); context.setMessage({ kind: "status", text: COPY.archived });
  }, WRITE_ACTION.archive);
}

/** @param context - Current render facts. @param index - Explicitly selected own historical original. @returns Nothing after moving its preserved identity back for GET-first consultation, without another POST. */
export async function restoreRecoveryHistory(context: NotificationRecoveryContext, index: number): Promise<void> {
  if (context.reference || !context.history[index]) return;
  const original = context.history[index];
  await observeRecovery(context, async () => {
    const next = context.history.filter((_, position) => position !== index);
    if (!preserveRecovery(context, original, original.deliveryId, next)) return;
    context.setHistory(next); showOriginal(context, original); context.setSelectedDeliveryId(original.deliveryId); context.setMessage({ kind: "status", text: COPY.pending });
  });
}

/** @param context - Current render facts. @param deliveryId - Notice the user selected. @returns Nothing after preserving the draft selection, unless a read, original or observation forbids it. */
export function selectRecoveryDelivery(context: NotificationRecoveryContext, deliveryId: string): void {
  if (!context.canRead || context.reference || context.busy) return;
  context.setClockMs(Date.now()); context.setConfirmed(false); context.setSelectedDeliveryId(deliveryId); context.setMessage(null); preserveRecovery(context, null, deliveryId);
}

/** @param context - Current render facts. @returns Nothing after forgetting a known completed original. */
export function clearCompletedRecovery(context: NotificationRecoveryContext): void {
  if (!context.originalCompleted || context.busy || !context.canRead || !preserveRecovery(context, null)) return;
  context.originalReference.current = null; context.setReference(null); context.setOriginalCompleted(false); context.setMayResume(false); context.setConfirmed(false); context.setMessage(null);
}
