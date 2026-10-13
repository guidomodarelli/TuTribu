/** Preserves only current-viewer notification draft and original UUID/CAS, never consent or authority. @module notification-recovery-intent-store */
/** Local metadata is an attempted original, not evidence of a registered server operation. */
export type NotificationRecoveryReference = { operationId: string; deliveryId: string; expectedVersion: number; targetConnectionId: string; expectedTargetVersion: number };
/** Restoring a selection never restores confirmation, Google recency or readiness. */
export type NotificationRecoveryDraft = { deliveryId: string; targetConnectionId: string };
/** A single unresolved reference must be consulted before another recovery can replace it. */
export type NotificationRecoverySnapshot = { draft: NotificationRecoveryDraft | null; reference: NotificationRecoveryReference | null; history?: NotificationRecoveryReference[] };
/** Unavailable/corrupt storage blocks mutation instead of pretending there was no attempted original. */
export interface NotificationRecoveryIntentStore {
  /** @param viewerId - Current verified own viewer. @param slug - Exact owning route. @returns Guarded local metadata, genuine absence or safe storage unavailability. */
  read(viewerId: string, slug: string): { state: "ready"; value: NotificationRecoverySnapshot } | { state: "unavailable" };
  /** @param viewerId - Current verified own viewer. @param slug - Exact owning route. @param snapshot - Metadata only, without consent or private data. @returns Whether the original was safely preserved before any POST/navigation. */
  save(viewerId: string, slug: string, snapshot: NotificationRecoverySnapshot): boolean;
}
