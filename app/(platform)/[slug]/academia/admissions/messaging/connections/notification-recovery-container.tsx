"use client";
/** Owns current-viewer notification selection, preserved original recovery and explicit same-origin observations. @module notification-recovery-container */
import { useEffect, useRef, useState } from "react";
import { useNotificationRecoveryLocalSnapshot } from "./notification-recovery-local-snapshot";
import { MessagingNotificationRecovery } from "@/components/academy-admissions/messaging-notification-recovery";
import type { MessagingConfigurationConnection } from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type { NotificationDeliveryCatalogResult } from "@/src/modules/messaging/application/results/notification-delivery-catalog-result";
import type { NotificationRecoveryBrowserClient } from "@/src/modules/messaging/application/ports/notification-recovery-browser-client";
import type { NotificationRecoveryIntentStore, NotificationRecoveryReference } from "@/src/modules/messaging/application/ports/notification-recovery-intent-store";
import type { NotificationDeliveryRecoveryResult } from "@/src/modules/messaging/application/results/notification-delivery-recovery-result";
import { notificationRecoveryBrowserClient } from "@/lib/messaging/notification-recovery-api-client";
import { notificationRecoveryIntentStore } from "@/lib/messaging/notification-recovery-intent-store";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { NOTIFICATION_RECOVERY_UI_COPY as COPY } from "@/src/modules/messaging/constants/notification-recovery-ui";
import { NOTIFICATION_DELIVERY_RECOVERY_AUDIT } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_PUBLIC_CHANNEL, MESSAGING_CAPABILITY_PUBLIC_STATE } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { NOTIFICATION_RECOVERY_HISTORY_LIMIT } from "@/src/modules/messaging/constants/notification-recovery-intent";

/** The route supplies one verified viewer boundary shared with the rest of the connection workflow. */
export type NotificationRecoveryContainerProps = {
  slug: string; viewerId: string; renderedAt: string;
  target: MessagingConfigurationConnection | null;
  blocked: boolean; viewerVerified: boolean;
  initialCatalog?: NotificationDeliveryCatalogResult;
  initialCatalogError?: string;
  verifyViewer: (signal: AbortSignal) => Promise<boolean>;
  onBusyChange: (busy: boolean) => void;
  client?: NotificationRecoveryBrowserClient;
  store?: NotificationRecoveryIntentStore;
};

/** @param props - Own SSR facts, current-viewer boundary and browser ports. @returns Controlled recovery with no automatic POST, route refresh or restoration of consent. */
export function NotificationRecoveryContainer({ client = notificationRecoveryBrowserClient, store = notificationRecoveryIntentStore, ...props }: NotificationRecoveryContainerProps) {
  const [catalog, setCatalog] = useState<NotificationDeliveryCatalogResult | null>(props.initialCatalog ?? null);
  const local = useNotificationRecoveryLocalSnapshot(store, props.viewerId, props.slug, props.viewerVerified);
  const [selection, setSelectedDeliveryId] = useState<string | null>(null);
  const [explicitReference, setReference] = useState<NotificationRecoveryReference | null | undefined>(undefined);
  const [explicitHistory, setHistory] = useState<NotificationRecoveryReference[] | undefined>(undefined);
  const reference = explicitReference === undefined ? local?.state === "ready" ? local.value.reference : null : explicitReference;
  const history = explicitHistory ?? (local?.state === "ready" ? local.value.history ?? [] : []);
  const historyFull = history.length >= NOTIFICATION_RECOVERY_HISTORY_LIMIT;
  const selectedDeliveryId = selection ?? reference?.deliveryId ?? (local?.state === "ready" ? local.value.draft?.deliveryId : null) ?? "";
  const [confirmation, setConfirmation] = useState<{ checked: boolean; scope: string } | null>(null), [storageAvailable, setStorageAvailable] = useState(true);
  const [viewerAvailable, setViewerAvailable] = useState(true);
  const [busy, setBusy] = useState(false), [mayResume, setMayResume] = useState(false), [originalCompleted, setOriginalCompleted] = useState(false);
  const [canArchive, setCanArchive] = useState(false), [archiveConsent, setArchiveConsent] = useState<{ checked: boolean; operationId: string } | null>(null);
  const archiveConfirmed = Boolean(reference && archiveConsent?.checked && archiveConsent.operationId === reference.operationId);
  const [notice, setNotice] = useState<{ kind: "status" | "alert"; text: string; scope: string } | null>(props.initialCatalogError ? { kind: "alert", text: props.initialCatalogError, scope: `:${props.target?.id}:${props.target?.version}` } : null);
  const mounted = useRef(true), observation = useRef<AbortController | null>(null), originalReference = useRef<NotificationRecoveryReference | null>(null);
  const onBusyChange = props.onBusyChange;
  const confirmationScope = `${reference?.deliveryId ?? selectedDeliveryId}:${reference?.targetConnectionId ?? props.target?.id}:${reference?.expectedTargetVersion ?? props.target?.version}`;
  const confirmed = Boolean(confirmation?.checked && confirmation.scope === confirmationScope);
  const message = local?.state === "unavailable" || !storageAvailable ? { kind: "alert" as const, text: COPY.storageUnavailable } : notice && (notice.scope === confirmationScope || notice.text === COPY.currentRequired || notice.text === COPY.archived) ? { kind: notice.kind, text: notice.text } : null;
  /** @param value - Fresh explicit consent for exactly the current original selection. @returns Nothing; a changed context cannot inherit confirmation. */
  function setConfirmed(value: boolean): void { setConfirmation({ checked: value, scope: confirmationScope }); }
  /** @param value - Current operation feedback or explicit cleanup. @returns Nothing; stale resource feedback is hidden after selection changes. */
  function setMessage(value: { kind: "status" | "alert"; text: string } | null): void { setNotice(value ? { ...value, scope: confirmationScope } : null); }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (observation.current) { observation.current.abort(); observation.current = null; onBusyChange(false); } }; }, [onBusyChange]);

  const selected = catalog?.items.find((item) => item.id === selectedDeliveryId);
  const canRead = local?.state === "ready" && storageAvailable && viewerAvailable && props.viewerVerified && !props.blocked;
  const targetPrepared = props.target?.state === MESSAGING_CONNECTION_STATE.active && props.target.capabilities.some((capability) => capability.channel === MESSAGING_PUBLIC_CHANNEL.email && capability.state === MESSAGING_CAPABILITY_PUBLIC_STATE.prepared && capability.testedAt !== null);
  /** @param now - Actual interaction time, or deterministic initial SSR time. @returns Whether current view facts permit an explicit attempt; the server still owns final authorization/eligibility. */
  const eligible = (now: Date) => Boolean(selected && props.target && targetPrepared && selected.connectionId !== props.target.id && !selected.recoveryDeliveryId && selected.state !== MESSAGE_DELIVERY_STATE.unknown && selected.state !== MESSAGE_DELIVERY_STATE.accepted && selected.state !== MESSAGE_DELIVERY_STATE.delivered && new Date(selected.deadlineAt) > now);
  /** @param value - Original result returned by its exact public namespace. @param original - Preserved UUID/CAS/target intent. @returns Whether the result belongs to this original reference. */
  const bound = (value: NotificationDeliveryRecoveryResult, original: NotificationRecoveryReference) => value.originalDeliveryId.toLowerCase() === original.deliveryId.toLowerCase() && value.targetConnectionId.toLowerCase() === original.targetConnectionId.toLowerCase() && value.originalVersion === original.expectedVersion + 1;
  /** @param next - Metadata-only attempted original, or explicitly cleared known completion. @param deliveryId - Current selected draft resource. @param nextHistory - Preserved originals without silently dropping any identity. @returns Whether the reference is preserved before any write/navigation. */
  function preserve(next: NotificationRecoveryReference | null, deliveryId = selectedDeliveryId, nextHistory = history): boolean {
    const targetConnectionId = next?.targetConnectionId ?? props.target?.id;
    const saved = store.save(props.viewerId, props.slug, { reference: next, draft: deliveryId && targetConnectionId ? { deliveryId, targetConnectionId } : null, history: nextHistory });
    if (!saved) { setStorageAvailable(false); setMessage({ kind: "alert", text: COPY.storageUnavailable }); }
    return saved;
  }
  /** @param work - One explicit observation using its own abort lifetime. @returns Nothing after current-viewer checks and safe feedback; no retry or inferred rollback. */
  async function observe(work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (!canRead || observation.current) return;
    const controller = new AbortController(); originalReference.current = reference; observation.current = controller; setBusy(true); props.onBusyChange(true); setMessage(null);
    try {
      if (!await current(controller.signal)) return;
      await work(controller.signal);
    } catch { if (!controller.signal.aborted && mounted.current) setMessage({ kind: "alert", text: originalReference.current ? COPY.pending : MESSAGING_ERROR_MESSAGE[MESSAGING_ERROR_CODE.unexpectedFailure] }); }
    finally { if (observation.current === controller) { observation.current = null; if (mounted.current) { setBusy(false); props.onBusyChange(false); } } }
  }
  /** @param signal - Current observation. @returns Whether the current account still owns this result after awaited I/O. */
  async function current(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted || !mounted.current) return false;
    const actual = await props.verifyViewer(signal);
    if (signal.aborted || !mounted.current) return false;
    if (!actual) { setViewerAvailable(false); setCatalog(null); setConfirmed(false); setMessage({ kind: "alert", text: COPY.currentRequired }); }
    return actual;
  }
  /** @param more - Whether to use the previous stable page cursor. @returns Nothing after updating only the owned notification projection. */
  async function readCatalog(more = false): Promise<void> {
    await observe(async (signal) => {
      setMessage({ kind: "status", text: COPY.reading });
      const outcome = await client.catalog({ slug: props.slug, cursor: more ? catalog?.nextCursor ?? null : null }, signal);
      if (!await current(signal)) return;
      if (outcome.status === "ready") { setCatalog(outcome.value); setConfirmed(false); if (!reference) setSelectedDeliveryId(""); setMessage(null); }
      else if (outcome.status === "failed") setMessage({ kind: "alert", text: outcome.message });
    });
  }
  /** @param original - Exact preserved original attempt. @param signal - Current observation. @returns Nothing after one explicit POST; ambiguity retains the original. */
  async function submit(original: NotificationRecoveryReference, signal: AbortSignal): Promise<void> {
    const outcome = await client.recover({ slug: props.slug, deliveryId: original.deliveryId }, { operationId: original.operationId, expectedVersion: original.expectedVersion, targetConnectionId: original.targetConnectionId, expectedTargetVersion: original.expectedTargetVersion, confirmed: true, reason: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.cause }, signal);
    if (!await current(signal)) return;
    setConfirmed(false); setMayResume(false); setCanArchive(false); setArchiveConsent(null);
    if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.completed && bound(outcome.value.result, original)) { setOriginalCompleted(true); setMessage({ kind: "status", text: COPY.completed }); }
    else setMessage({ kind: "alert", text: outcome.status === "failed" && !outcome.uncertain ? outcome.message : COPY.pending });
  }
  /** @param resume - Whether the user explicitly reuses a consulted preserved original. @returns Nothing after preserving UUID/CAS before a single write. */
  async function recover(resume = false): Promise<void> {
    if (!resume && historyFull) { setMessage({ kind: "alert", text: COPY.historyFull }); return; }
    if (!confirmed) { setMessage({ kind: "alert", text: COPY.consentRequired }); return; }
    if (resume ? !reference || !mayResume : Boolean(reference) || !eligible(new Date())) { setMessage({ kind: "alert", text: COPY.selectionRequired }); return; }
    await observe(async (signal) => {
      const original = resume ? reference : selected && props.target ? { operationId: newAdmissionOperationId(), deliveryId: selected.id, expectedVersion: selected.version, targetConnectionId: props.target.id, expectedTargetVersion: props.target.version } : null;
      if (!original || !preserve(original)) return;
      originalReference.current = original; setReference(original); setOriginalCompleted(false); setMayResume(false); await submit(original, signal);
    });
  }
  /** @returns Nothing after original GET only, without another mutation. */
  async function readOriginal(): Promise<void> {
    if (!reference) return;
    const original = reference;
    await observe(async (signal) => {
      setMessage({ kind: "status", text: COPY.originalReading });
      const outcome = await client.operation({ slug: props.slug, operationId: original.operationId }, signal);
      if (!await current(signal)) return;
      setConfirmed(false); setMayResume(false); setCanArchive(false); setArchiveConsent(null);
      if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.completed && bound(outcome.value.result, original)) { setOriginalCompleted(true); setMessage({ kind: "status", text: COPY.completed }); }
      else if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.started) { setMayResume(true); setCanArchive(true); setMessage({ kind: "status", text: COPY.originalStarted }); }
      else if (outcome.status === "failed" && outcome.code === MESSAGING_ERROR_CODE.resourceUnavailable) { setMayResume(true); setCanArchive(true); setMessage({ kind: "status", text: COPY.originalAbsent }); }
      else setMessage({ kind: "alert", text: outcome.status === "failed" ? outcome.message : COPY.pending });
    });
  }
  /** @returns Nothing after stopping observation only; a preserved original remains consultable. */
  function stopObserving(): void { observation.current?.abort(); observation.current = null; setBusy(false); props.onBusyChange(false); setConfirmed(false); setMayResume(false); setMessage({ kind: "status", text: COPY.stopped }); }
  /** @returns Nothing after explicitly preserving a consulted original in history; the backend is never cancelled or assumed rolled back. */
  async function archiveOriginal(): Promise<void> {
    if (!reference || !canArchive || !archiveConfirmed || originalCompleted) return;
    const original = reference;
    await observe(async () => {
      if (history.length >= NOTIFICATION_RECOVERY_HISTORY_LIMIT) { setMessage({ kind: "alert", text: COPY.historyFull }); return; }
      const next = [...history, original];
      if (!preserve(null, "", next)) return;
      originalReference.current = null; setHistory(next); setReference(null); setSelectedDeliveryId(""); setOriginalCompleted(false); setCanArchive(false); setMayResume(false); setConfirmed(false); setArchiveConsent(null); setMessage({ kind: "status", text: COPY.archived });
    });
  }
  /** @param index - Explicitly selected own historical original. @returns Nothing after moving its preserved identity back for GET-first consultation, without another POST. */
  async function restoreHistory(index: number): Promise<void> {
    if (reference || !history[index]) return;
    const original = history[index];
    await observe(async () => {
      const next = history.filter((_, position) => position !== index);
      if (!preserve(original, original.deliveryId, next)) return;
      originalReference.current = original; setHistory(next); setReference(original); setSelectedDeliveryId(original.deliveryId); setOriginalCompleted(false); setCanArchive(false); setMayResume(false); setConfirmed(false); setArchiveConsent(null); setMessage({ kind: "status", text: COPY.pending });
    });
  }
  return <MessagingNotificationRecovery items={catalog?.items ?? []} selectedDeliveryId={selectedDeliveryId} targetName={props.target?.name ?? null} catalogAvailable={catalog !== null} hasMore={Boolean(catalog?.nextCursor)} busy={busy} canRead={canRead} canRecover={canRead && !reference && !historyFull && eligible(new Date(props.renderedAt))} confirmed={confirmed} hasReference={reference !== null} originalCompleted={originalCompleted} mayResume={canRead && mayResume} canArchive={canArchive} archiveConfirmed={archiveConfirmed} historyCount={history.length} historyFull={historyFull} message={message} onArchiveConfirm={(value) => { setArchiveConsent(reference ? { checked: value, operationId: reference.operationId } : null); setMessage(null); }} onArchive={() => { void archiveOriginal(); }} onRestoreHistory={(index) => { void restoreHistory(index); }}
    onSelect={(deliveryId) => { if (!canRead || reference || busy) return; setConfirmed(false); setSelectedDeliveryId(deliveryId); setMessage(null); preserve(null, deliveryId); }} onConfirm={(value) => { setConfirmed(value); setMessage(null); }} onRefresh={() => { void readCatalog(); }} onMore={() => { void readCatalog(true); }} onRecover={() => { void recover(); }} onReadOriginal={() => { void readOriginal(); }} onResumeOriginal={() => { void recover(true); }} onClearCompleted={() => { if (!originalCompleted || busy || !canRead || !preserve(null)) return; originalReference.current = null; setReference(null); setOriginalCompleted(false); setMayResume(false); setConfirmed(false); setMessage(null); }} onStopObserving={stopObserving} />;
}
