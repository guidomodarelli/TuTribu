/** Maps only selected native checkpoint columns without schema-validating database rows. @module admission-notification-collection-progress-mapper */
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionNotificationAudience } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationCollectionPageResult, AdmissionNotificationCollectionProgressSnapshot } from "../../domain/repositories/admission-notification-collection-progress";
import type { AdmissionNotificationSourceCursor, AdmissionNotificationSourcePosition } from "../../domain/repositories/admission-notification-source-reader";

/** Retains native microseconds as textual integers until their existing safe-integer boundary. */
export type AdmissionNotificationCollectionProgressRow = {
  tribe_id: string; version: number; through_microseconds: string | null; after_created_microseconds: string | null;
  after_obligation_id: string | null; after_recipient_user_id: string | null; after_audience: AdmissionNotificationAudience | null;
  last_operation_id: string | null; last_completed_microseconds: string | null; last_sweep_completed_microseconds: string | null;
  last_page_through_microseconds: string | null; last_certified_through_microseconds: string | null; sweep_had_unavailable: boolean;
  examined: number; collected: number; existing: number; suppressed: number; unavailable: number; bucket_closed: number; sweep_complete: boolean;
};

/** @param row - Coherent SQL-owned checkpoint. @returns Only the latest immutable page metadata, without a source cursor or delivery authority. */
export function collectionProgressPageResult(row: AdmissionNotificationCollectionProgressRow): AdmissionNotificationCollectionPageResult | null {
  if (row.last_operation_id === null) return null;
  if (row.last_completed_microseconds === null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.dependencyUnavailable);
  return { tribeId: row.tribe_id, operationId: row.last_operation_id, previousVersion: row.version - 1, version: row.version, examined: row.examined, collected: row.collected, existing: row.existing, suppressed: row.suppressed, unavailable: row.unavailable, bucketClosed: row.bucket_closed, sweepComplete: row.sweep_complete, completedAtMicroseconds: Number(row.last_completed_microseconds), sourceThroughMicroseconds: row.last_page_through_microseconds === null ? null : Number(row.last_page_through_microseconds), sweepHadUnavailable: row.sweep_had_unavailable, replayed: false };
}

/** @param row - Native checkpoint whose constraints keep all frontier fields coherent. @returns The last source examined by any sweep, or null before the first one. */
export function collectionProgressFrontier(row: AdmissionNotificationCollectionProgressRow): AdmissionNotificationSourcePosition | null {
  if (row.after_created_microseconds === null) return null;
  if (row.after_obligation_id === null || row.after_recipient_user_id === null || row.after_audience === null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.dependencyUnavailable);
  return { createdAtMicroseconds: Number(row.after_created_microseconds), obligationId: row.after_obligation_id, recipientUserId: row.after_recipient_user_id, audience: row.after_audience };
}

/** @param row - Native checkpoint whose constraints keep all continuation fields coherent. @returns The open sweep's horizon and frontier, or null when the next page starts a new sweep; this is never a send token. */
export function collectionProgressCursor(row: AdmissionNotificationCollectionProgressRow): AdmissionNotificationSourceCursor | null {
  return row.through_microseconds === null ? null : { tribeId: row.tribe_id, throughMicroseconds: Number(row.through_microseconds), after: collectionProgressFrontier(row) };
}

/** @param tribeId - Existing current native scope. @param row - Existing checkpoint, without an initializing write. @returns Bounded current recovery metadata; absent continuation does not imply a globally empty queue. */
export function collectionProgressSnapshot(tribeId: string, row: AdmissionNotificationCollectionProgressRow | null): AdmissionNotificationCollectionProgressSnapshot {
  return row ? { tribeId, version: row.version, hasContinuation: row.through_microseconds !== null, lastPage: collectionProgressPageResult(row), lastSweepCompletedAtMicroseconds: row.last_sweep_completed_microseconds === null ? null : Number(row.last_sweep_completed_microseconds), lastCertifiedThroughMicroseconds: row.last_certified_through_microseconds === null ? null : Number(row.last_certified_through_microseconds) } : { tribeId, version: 0, hasContinuation: false, lastPage: null, lastSweepCompletedAtMicroseconds: null, lastCertifiedThroughMicroseconds: null };
}
