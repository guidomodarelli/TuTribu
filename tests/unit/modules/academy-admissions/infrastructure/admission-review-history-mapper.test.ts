/** Exercises storage-to-domain minimization without revalidating a PostgreSQL payload schema. @module admission-review-history-mapper-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapAdmissionReviewHistoryStorage } from "@/src/modules/academy-admissions/infrastructure/repositories/admission-review-history-storage-mapper";

/** @returns Only the consumed backend contract plus separate fixture-only private extras. */
function fixture() {
  return { id: randomUUID(), tribe_id: randomUUID(), admission_request_id: randomUUID(), event_type: "pending_created", from_status: null, to_status: "pending", resource_version: 1, actor_kind: "account" as const, created_at: "2026-10-16T01:00:00.123456Z", cursor_at: "2026-10-16T01:00:00.123456Z" };
}

describe("request review history storage mapping", () => {
  it("should map only consumed facts and preserve the display instant", () => {
    const row = { ...fixture(), actor_user_id: randomUUID(), operation_id: randomUUID(), metadata: { rawContact: "private-fixture@example.test", internalReason: "Private fixture history note" } };
    expect(mapAdmissionReviewHistoryStorage(row)).toEqual({ id: row.id, tribeId: row.tribe_id, admissionRequestId: row.admission_request_id, eventType: "pending_created", fromStatus: null, toStatus: "pending", resourceVersion: 1, actorKind: "account", createdAt: new Date("2026-10-16T01:00:00.123Z") });
  });

  it("should map a compatible unknown producer label and status to safe unspecified facts", () => {
    const row = { ...fixture(), event_type: "legacy-private-producer-label", from_status: "private-old-status", to_status: "private-new-status", actor_kind: "unattributed" as const, resource_version: null };
    const event = mapAdmissionReviewHistoryStorage(row);
    expect(event).toMatchObject({ eventType: "unclassified", fromStatus: null, toStatus: null, actorKind: "unattributed", resourceVersion: null });
    expect(JSON.stringify(event)).not.toContain("private-");
  });

  it("should preserve the original request scope and known terminal transition for the application guard", () => {
    const row = { ...fixture(), event_type: "rejected", from_status: "pending", to_status: "rejected" };
    expect(mapAdmissionReviewHistoryStorage(row)).toMatchObject({ tribeId: row.tribe_id, admissionRequestId: row.admission_request_id, eventType: "rejected", fromStatus: "pending", toStatus: "rejected" });
  });
});
