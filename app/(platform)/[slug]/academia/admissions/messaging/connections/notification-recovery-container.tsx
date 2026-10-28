"use client";
/** Owns current-viewer notification selection, preserved original recovery and explicit same-origin observations. @module notification-recovery-container */
import { useEffect, useRef, useState } from "react";
import { useNotificationRecoveryLocalSnapshot } from "./notification-recovery-local-snapshot";
import { MessagingNotificationRecovery } from "@/components/academy-admissions/messaging-notification-recovery";
import type { MessagingConfigurationConnection } from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type { NotificationDeliveryCatalogResult } from "@/src/modules/messaging/application/results/notification-delivery-catalog-result";
import type { NotificationRecoveryBrowserClient } from "@/src/modules/messaging/application/ports/notification-recovery-browser-client";
import type { NotificationRecoveryIntentStore, NotificationRecoveryReference } from "@/src/modules/messaging/application/ports/notification-recovery-intent-store";
import { notificationRecoveryBrowserClient } from "@/lib/messaging/notification-recovery-api-client";
import { notificationRecoveryIntentStore } from "@/lib/messaging/notification-recovery-intent-store";
import { NOTIFICATION_RECOVERY_UI_COPY as COPY, type NotificationRecoveryWriteAction } from "@/src/modules/messaging/constants/notification-recovery-ui";
import { NOTIFICATION_RECOVERY_HISTORY_LIMIT } from "@/src/modules/messaging/constants/notification-recovery-intent";
import { archiveRecoveryOriginal, clearCompletedRecovery, isRecoveryEligible, isRecoveryTargetPrepared, readRecoveryCatalog, readRecoveryOriginal, recoverNotification, restoreRecoveryHistory, selectRecoveryDelivery, stopRecoveryObservation, type NotificationRecoveryContext, type RecoveryMessage } from "./notification-recovery-actions";
import { TIMER_MAXIMUM_DELAY_MS } from "@/src/constants/time";

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

type LocalRecoverySnapshot = ReturnType<typeof useNotificationRecoveryLocalSnapshot>;
type RecoveryNotice = RecoveryMessage & { scope: string };

/** @param explicitReference - Reference chosen in this view, or undefined before any change. @param local - Guarded local snapshot. @returns The current preserved original, if any. */
function resolveReference(explicitReference: NotificationRecoveryReference | null | undefined, local: LocalRecoverySnapshot): NotificationRecoveryReference | null {
  if (explicitReference !== undefined) return explicitReference;
  return local?.state === "ready" ? local.value.reference : null;
}

/** @param local - Guarded local snapshot. @returns Its ready snapshot value, or null. */
function readySnapshot(local: LocalRecoverySnapshot) {
  return local?.state === "ready" ? local.value : null;
}

/** @param local - Guarded local snapshot. @param storageAvailable - Whether saving still works. @param notice - Latest scoped feedback. @param confirmationScope - Current selection scope. @returns Storage failure first, then feedback still valid for the current scope. */
function resolveRecoveryMessage(local: LocalRecoverySnapshot, storageAvailable: boolean, notice: RecoveryNotice | null, confirmationScope: string): RecoveryMessage | null {
  if (local?.state === "unavailable" || !storageAvailable) return { kind: "alert", text: COPY.storageUnavailable };
  if (!notice) return null;
  return notice.scope === confirmationScope || notice.text === COPY.currentRequired || notice.text === COPY.archived ? { kind: notice.kind, text: notice.text } : null;
}

/** @param selected - Selected notice, if any. @returns Its parsed deadline, or null when absent or invalid. */
function selectedDeadline(selected: { deadlineAt: string } | undefined): number | null {
  const parsedDeadlineMs = selected ? Date.parse(selected.deadlineAt) : Number.NaN;
  return Number.isFinite(parsedDeadlineMs) ? parsedDeadlineMs : null;
}

/** A deadline only matters once: one timeout at the selected notice's deadline (in steps past the timer limit) replaces a ticking clock. @param selectedDeadlineMs - Selected deadline. @param clockMs - Last evaluated time. @param setClockMs - Clock setter. @returns Nothing. */
function useDeadlineClock(selectedDeadlineMs: number | null, clockMs: number, setClockMs: (value: number) => void): void {
  useEffect(() => { if (selectedDeadlineMs === null || selectedDeadlineMs <= clockMs) return; const timer = window.setTimeout(() => setClockMs(Date.now()), Math.min(Math.max(0, selectedDeadlineMs - Date.now()), TIMER_MAXIMUM_DELAY_MS)); return () => window.clearTimeout(timer); }, [selectedDeadlineMs, clockMs, setClockMs]);
}

/** @param props - Own SSR facts, current-viewer boundary and browser ports. @returns Controlled recovery with no automatic POST, route refresh or restoration of consent. */
export function NotificationRecoveryContainer({ client = notificationRecoveryBrowserClient, store = notificationRecoveryIntentStore, ...props }: NotificationRecoveryContainerProps) {
  const [catalog, setCatalog] = useState<NotificationDeliveryCatalogResult | null>(props.initialCatalog ?? null);
  const local = useNotificationRecoveryLocalSnapshot(store, props.viewerId, props.slug, props.viewerVerified);
  const [selection, setSelectedDeliveryId] = useState<string | null>(null);
  const [explicitReference, setReference] = useState<NotificationRecoveryReference | null | undefined>(undefined);
  const [explicitHistory, setHistory] = useState<NotificationRecoveryReference[] | undefined>(undefined);
  const reference = resolveReference(explicitReference, local), snapshot = readySnapshot(local);
  const history = explicitHistory ?? snapshot?.history ?? [];
  const historyFull = history.length >= NOTIFICATION_RECOVERY_HISTORY_LIMIT;
  const selectedDeliveryId = selection ?? reference?.deliveryId ?? snapshot?.draft?.deliveryId ?? "";
  const [confirmation, setConfirmation] = useState<{ checked: boolean; scope: string } | null>(null), [storageAvailable, setStorageAvailable] = useState(true);
  const [viewerAvailable, setViewerAvailable] = useState(true);
  const [busy, setBusy] = useState(false), [mayResume, setMayResume] = useState(false), [originalCompleted, setOriginalCompleted] = useState(false);
  /** `busy` covers reads and writes; this names only the pressed write, and only while that observation lasts. */
  const [writeAction, setWriteAction] = useState<NotificationRecoveryWriteAction | null>(null);
  const [canArchive, setCanArchive] = useState(false), [archiveConsent, setArchiveConsent] = useState<{ checked: boolean; operationId: string } | null>(null);
  const archiveConfirmed = Boolean(reference && archiveConsent?.checked && archiveConsent.operationId === reference.operationId);
  const [notice, setNotice] = useState<RecoveryNotice | null>(props.initialCatalogError ? { kind: "alert", text: props.initialCatalogError, scope: `:${props.target?.id}:${props.target?.version}` } : null);
  const mounted = useRef(true), observation = useRef<AbortController | null>(null), originalReference = useRef<NotificationRecoveryReference | null>(null);
  const onBusyChange = props.onBusyChange;
  const confirmationScope = `${reference?.deliveryId ?? selectedDeliveryId}:${reference?.targetConnectionId ?? props.target?.id}:${reference?.expectedTargetVersion ?? props.target?.version}`;
  const confirmed = Boolean(confirmation?.checked && confirmation.scope === confirmationScope);
  const message = resolveRecoveryMessage(local, storageAvailable, notice, confirmationScope);
  /** @param value - Fresh explicit consent for exactly the current original selection. @returns Nothing; a changed context cannot inherit confirmation. */
  function setConfirmed(value: boolean): void { setConfirmation({ checked: value, scope: confirmationScope }); }
  /** @param value - Current operation feedback or explicit cleanup. @returns Nothing; stale resource feedback is hidden after selection changes. */
  function setMessage(value: RecoveryMessage | null): void { setNotice(value ? { ...value, scope: confirmationScope } : null); }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (observation.current) { observation.current.abort(); observation.current = null; onBusyChange(false); } }; }, [onBusyChange]);

  const selected = catalog?.items.find((item) => item.id === selectedDeliveryId);
  /** When eligibility was last evaluated: the SSR time first (deterministic hydration), then each interaction and the selected deadline. */
  const [clockMs, setClockMs] = useState(() => Date.parse(props.renderedAt));
  const selectedDeadlineMs = selectedDeadline(selected);
  useDeadlineClock(selectedDeadlineMs, clockMs, setClockMs);
  /** A new recovery is no longer available once the notice's deadline passed; a preserved original keeps its own recovery. */
  const expired = !reference && selectedDeadlineMs !== null && selectedDeadlineMs <= clockMs;
  const canRead = local?.state === "ready" && storageAvailable && viewerAvailable && props.viewerVerified && !props.blocked;
  const targetPrepared = isRecoveryTargetPrepared(props.target);
  /** @returns This render's facts, refs and setters for one explicit handler; refs are only read when a handler runs. */
  const recoveryContext = (): NotificationRecoveryContext => ({ slug: props.slug, viewerId: props.viewerId, target: props.target, client, store, verifyViewer: props.verifyViewer, onBusyChange: props.onBusyChange, catalog, selected, selectedDeliveryId, reference, history, historyFull, canRead, confirmed, mayResume, canArchive, archiveConfirmed, originalCompleted, busy, targetPrepared,
    mounted, observation, originalReference, setCatalog, setSelectedDeliveryId, setReference, setHistory, setStorageAvailable, setViewerAvailable, setBusy, setWriteAction, setMayResume, setOriginalCompleted, setCanArchive, setArchiveConsent, setClockMs, setConfirmed, setMessage });
  return <MessagingNotificationRecovery items={catalog?.items ?? []} selectedDeliveryId={selectedDeliveryId} targetName={props.target?.name ?? null} catalogAvailable={catalog !== null} hasMore={Boolean(catalog?.nextCursor)} busy={busy} writeAction={busy ? writeAction : null} canRead={canRead} canRecover={canRead && !reference && !historyFull && isRecoveryEligible({ selected, target: props.target, targetPrepared }, new Date(clockMs))} expired={expired} confirmed={confirmed} hasReference={reference !== null} originalCompleted={originalCompleted} mayResume={canRead && mayResume} canArchive={canArchive} archiveConfirmed={archiveConfirmed} historyCount={history.length} historyFull={historyFull} message={message} onArchiveConfirm={(value) => { setArchiveConsent(reference ? { checked: value, operationId: reference.operationId } : null); setMessage(null); }} onArchive={() => { void archiveRecoveryOriginal(recoveryContext()); }} onRestoreHistory={(index) => { void restoreRecoveryHistory(recoveryContext(), index); }}
    onSelect={(deliveryId) => { selectRecoveryDelivery(recoveryContext(), deliveryId); }} onConfirm={(value) => { setConfirmed(value); setMessage(null); }} onRefresh={() => { void readRecoveryCatalog(recoveryContext()); }} onMore={() => { void readRecoveryCatalog(recoveryContext(), true); }} onRecover={() => { void recoverNotification(recoveryContext()); }} onReadOriginal={() => { void readRecoveryOriginal(recoveryContext()); }} onResumeOriginal={() => { void recoverNotification(recoveryContext(), true); }} onClearCompleted={() => { clearCompletedRecovery(recoveryContext()); }} onStopObserving={() => { stopRecoveryObservation(recoveryContext()); }} />;
}
