/** Consumes the protected SQL contract and selects only owned domain facts, without row-schema validation. @module admission-review-history-storage-mapper */
import type { AdmissionReviewHistoryEvent, AdmissionReviewHistoryActorKind, AdmissionReviewHistoryEventKind } from "../../domain/entities/admission-review-history-event";
import type { AdmissionRequest } from "../../domain/entities/admission-request";
import { ADMISSION_REVIEW_HISTORY_EVENT } from "../../constants/admission-review-history";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";

/** Only consumed backend scalars are modeled; private metadata and actor identifiers are absent. */
export type AdmissionReviewHistoryStorageRow = {
  id: string; tribe_id: string; admission_request_id: string; event_type: string;
  from_status: string | null; to_status: string | null; resource_version: number | null;
  actor_kind: AdmissionReviewHistoryActorKind; created_at: Date | string; cursor_at: string;
};
/** Derived output vocabularies are computed locally; they do not impose a schema on the backend. */
const eventKinds: readonly AdmissionReviewHistoryEventKind[] = Object.values(ADMISSION_REVIEW_HISTORY_EVENT);
/** A compatible unknown historical state stays unspecified instead of becoming a private label. */
const requestStatuses: readonly AdmissionRequest["status"][] = Object.values(ADMISSION_REQUEST_STATUS);

/** @param row - The consumed contract of the protected SQL projection. @returns Minimal domain facts; the original cursor remains on the untouched storage row. */
export function mapAdmissionReviewHistoryStorage(row: AdmissionReviewHistoryStorageRow): AdmissionReviewHistoryEvent {
  return {
    id: row.id, tribeId: row.tribe_id, admissionRequestId: row.admission_request_id,
    eventType: eventKinds.find((kind) => kind === row.event_type) ?? ADMISSION_REVIEW_HISTORY_EVENT.unclassified,
    fromStatus: requestStatuses.find((status) => status === row.from_status) ?? null,
    toStatus: requestStatuses.find((status) => status === row.to_status) ?? null,
    resourceVersion: row.resource_version, actorKind: row.actor_kind, createdAt: new Date(row.created_at),
  };
}
