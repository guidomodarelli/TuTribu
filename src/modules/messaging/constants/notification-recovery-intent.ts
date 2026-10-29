/** Owns strictly bounded local recovery metadata, never browser permission or sensitive evidence. @module notification-recovery-intent */
import { z } from "zod";
/** Separates this attempted original from connection, diagnostic and usage operations. */
export const NOTIFICATION_RECOVERY_INTENT_STORAGE_PREFIX = "tutribu.notification-recovery.v1";
/** Bounds local unresolved references without silently dropping any original to make room. */
export const NOTIFICATION_RECOVERY_HISTORY_LIMIT = 10;
/** Restored selections are untrusted input; no consent, recipient or credential field is accepted. */
const notificationRecoveryDraftSchema = z.strictObject({ deliveryId: z.uuid(), targetConnectionId: z.uuid() });
/** Contains only the exact original operation and observed version metadata needed for consultation/resumption. */
const notificationRecoveryReferenceSchema = z.strictObject({ operationId: z.uuid(), deliveryId: z.uuid(), expectedVersion: z.int().positive(), targetConnectionId: z.uuid(), expectedTargetVersion: z.int().positive() });
/** Current-viewer ownership is checked independently before consuming stored route metadata. */
export const notificationRecoveryStorageSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), draft: notificationRecoveryDraftSchema.nullable(), reference: notificationRecoveryReferenceSchema.nullable(), history: z.array(notificationRecoveryReferenceSchema).max(NOTIFICATION_RECOVERY_HISTORY_LIMIT).default([]) }).refine((snapshot) => new Set(snapshot.history.map((reference) => reference.operationId.toLowerCase())).size === snapshot.history.length && (snapshot.reference === null || !snapshot.history.some((reference) => reference.operationId.toLowerCase() === snapshot.reference?.operationId.toLowerCase())));
