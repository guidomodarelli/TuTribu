/** Selects fixed owned history facts before public DTO validation, without validating PostgreSQL rows. @module admission-activity-storage-mapper */
import { ADMISSION_ACTIVITY_CHANGE_FIELDS, ADMISSION_ACTIVITY_EVENTS, ADMISSION_ACTIVITY_RESOURCE, ADMISSION_ACTIVITY_RULES, ADMISSION_ACTIVITY_CAUSES, ADMISSION_ACTIVITY_UNCLASSIFIED_EVENT } from "../../constants/admission-activity";
import { parseAdmissionActivityPage } from "../../application/results/admission-activity-result";
import { parseAdmissionMetricsResult, type AdmissionMetricsResult } from "../../application/results/admission-metrics-result";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import type { AdmissionMetricRunOperation } from "../../domain/entities/admission-metric-dimensions";

/** Only consumed private storage fields belong here; none becomes a permission marker. */
export type AdmissionActivityStorageRow = { id: string; tribe_id: string; actor_user_id: string | null; operation_id: string | null; tribe_lifecycle_operation_id: string | null; resource_type: string; resource_id: string | null; event_type: string; rule: string | null; cause: string | null; resource_version: number | null; metadata: Record<string, unknown>; created_at: Date | string; cursor_at: string };
/** Storage dates are consumed as dates, independently of the own millisecond DTO contract. */
export type AdmissionMetricsStorage = Omit<AdmissionMetricsResult, "asOf" | "usage" | "lastSuccessfulRun"> & { asOf: string; usage: Omit<AdmissionMetricsResult["usage"], "dayStartUtc"> & { dayStartUtc: string }; lastSuccessfulRun: { operation: AdmissionMetricRunOperation; at: string } | null };

/** @param tribeId - Already authorized exact scope. @param rows - Bounded original storage rows. @param nextCursor - Exact original SQL timestamp/id tuple. @returns Safe owned history without descriptive notes, contacts, payload or arbitrary labels. */
export function mapAdmissionActivityStorage(tribeId: string, rows: readonly AdmissionActivityStorageRow[], nextCursor: string | null) {
  const resources: readonly string[] = Object.values(ADMISSION_ACTIVITY_RESOURCE), events: readonly string[] = ADMISSION_ACTIVITY_EVENTS, rules: readonly string[] = ADMISSION_ACTIVITY_RULES, causes: readonly string[] = ADMISSION_ACTIVITY_CAUSES;
  const items = rows.map((row) => {
    if (row.tribe_id !== tribeId || !resources.includes(row.resource_type)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
    const changes: Record<string, unknown> = {};
    for (const field of ADMISSION_ACTIVITY_CHANGE_FIELDS) if (Object.hasOwn(row.metadata, field)) changes[field] = row.metadata[field];
    return { id: row.id, actorUserId: row.actor_user_id, operationId: row.operation_id, tribeLifecycleOperationId: row.tribe_lifecycle_operation_id,
      resourceType: row.resource_type, resourceId: row.resource_id, eventType: events.includes(row.event_type) ? row.event_type : ADMISSION_ACTIVITY_UNCLASSIFIED_EVENT,
      rule: row.rule !== null && rules.includes(row.rule) ? row.rule : null, cause: row.cause !== null && causes.includes(row.cause) ? row.cause : null,
      resourceVersion: row.resource_version, changes, createdAt: new Date(row.created_at).toISOString() };
  });
  return parseAdmissionActivityPage({ tribeId, items, nextCursor }, tribeId);
}
/** @param row - Own SQL aggregate projection, not a provider payload. @param tribeId - Native scope. @returns The finite own DTO with standardized dates and no copied extras. */
export function mapAdmissionMetricsStorage(row: AdmissionMetricsStorage, tribeId: string): AdmissionMetricsResult {
  return parseAdmissionMetricsResult({ tribeId: row.tribeId, asOf: new Date(row.asOf).toISOString(),
    requests: { pending: row.requests.pending, approved: row.requests.approved, rejected: row.requests.rejected, cancelled: row.requests.cancelled, expired: row.requests.expired, oldestPendingAgeMs: row.requests.oldestPendingAgeMs },
    reviews: { automatic: row.reviews.automatic, manual: row.reviews.manual },
    verification: row.verification.map((value) => ({ channel: value.channel, issued: value.issued, verified: value.verified, invalidated: value.invalidated, expired: value.expired, failedAttempts: value.failedAttempts })),
    deliveries: { queued: row.deliveries.queued, accepted: row.deliveries.accepted, delivered: row.deliveries.delivered, failed: row.deliveries.failed, unknown: row.deliveries.unknown, suppressed: row.deliveries.suppressed, cancelled: row.deliveries.cancelled, inFlightLeases: row.deliveries.inFlightLeases, oldestQueuedAgeMs: row.deliveries.oldestQueuedAgeMs },
    attempts: { inFlight: row.attempts.inFlight, accepted: row.attempts.accepted, delivered: row.attempts.delivered, rejected: row.attempts.rejected, unknown: row.attempts.unknown },
    usage: { policyVersion: row.usage.policyVersion, dayStartUtc: new Date(row.usage.dayStartUtc).toISOString(), verificationToday: row.usage.verificationToday, notificationToday: row.usage.notificationToday },
    errors: row.errors.map((value) => ({ code: value.code, count: value.count })), lastSuccessfulRun: row.lastSuccessfulRun ? { operation: row.lastSuccessfulRun.operation, at: new Date(row.lastSuccessfulRun.at).toISOString() } : null,
    durations: row.durations.map((value) => ({ phase: value.phase, sampleCount: value.sampleCount, p95Ms: value.p95Ms })),
  }, tribeId);
}
