/** Exercises the actual audit constructor and public activity projection for independent email changes. @module admission-notification-email-audit-test */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionResourceAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import { mapAdmissionActivityStorage } from "@/src/modules/academy-admissions/infrastructure/repositories/admission-activity-storage-mapper";

describe("independent email settings audit", () => {
  // The owner selects configuration facts instead of copying arbitrary metadata into durable history.
  it("should preserve the absent predecessor and select only the changed email configuration", () => {
    const metadata = { previousVersion: null, enabled: true, timeZone: "Asia/Kolkata", normalizedEmail: "synthetic@example.invalid", credential: "not selected" };
    const event = createAdmissionResourceAuditEvent({ tribeId: randomUUID(), actorUserId: randomUUID(), operationId: randomUUID(), resourceId: randomUUID(), resourceVersion: 1, resourceType: "admission_email_settings", eventType: "admission_email_settings_changed", rule: null, cause: null, createdAt: new Date("2026-10-15T17:00:00Z"), metadata });
    expect(event.metadata).toEqual({ previousVersion: null, enabled: true, timeZone: "Asia/Kolkata" });
    metadata.timeZone = "America/New_York";
    expect(event.metadata).toEqual({ previousVersion: null, enabled: true, timeZone: "Asia/Kolkata" });
  });

  it("should publish the owned configuration change without exposing contact or credential fields", () => {
    const tribeId = randomUUID(), id = randomUUID();
    const result = mapAdmissionActivityStorage(tribeId, [{ id, tribe_id: tribeId, actor_user_id: randomUUID(), operation_id: randomUUID(), tribe_lifecycle_operation_id: null, resource_type: "admission_email_settings", resource_id: tribeId, event_type: "admission_email_settings_changed", rule: null, cause: null, resource_version: 1, metadata: { previousVersion: null, enabled: true, timeZone: "Asia/Kolkata", normalizedEmail: "synthetic@example.invalid", credential: "not selected" }, created_at: "2026-10-15T17:00:00.000001Z", cursor_at: "2026-10-15T17:00:00.000001Z" }], null);
    expect(result.items[0]).toMatchObject({ id, resourceType: "admission_email_settings", eventType: "admission_email_settings_changed", changes: { previousVersion: null, enabled: true, timeZone: "Asia/Kolkata" } });
    expect(result.items[0].changes).toEqual({ previousVersion: null, enabled: true, timeZone: "Asia/Kolkata" });
  });
});
