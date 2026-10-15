/** Exercises owned history projection and the public DTO boundary without treating storage as caller input. @module admission-policy-history-projection-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapAdmissionActivityStorage, type AdmissionActivityStorageRow } from "@/src/modules/academy-admissions/infrastructure/repositories/admission-activity-storage-mapper";
import { admissionActivityChangesSchema } from "@/src/modules/academy-admissions/constants/admission-activity-schemas";

/** @returns Complete synthetic configuration with no resource/actor identity or secrets inside its flags. */
function policySnapshot() {
  return { mode: "manual_review", contactType: "email", isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: false,
    phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null, verificationEpoch: 1, activatedAt: null };
}
/** @param metadata - Storage-owned facts to project. @returns A real-shaped private row with stable scope and a native clock. */
function historyRow(metadata: Record<string, unknown>): AdmissionActivityStorageRow {
  const tribeId = randomUUID();
  return { id: randomUUID(), tribe_id: tribeId, actor_user_id: randomUUID(), operation_id: randomUUID(), tribe_lifecycle_operation_id: null,
    resource_type: "admission_policy", resource_id: tribeId, event_type: "update_admission_policy", rule: null, cause: null, resource_version: 2,
    metadata, created_at: "2026-10-14T23:00:00.123456Z", cursor_at: "2026-10-14T23:00:00.123456Z" };
}

describe("owned policy audit history projection", () => {
  it("should publish both exact configurations while stripping extra private properties at either snapshot level", () => {
    const before = policySnapshot(), after = { ...before, isOpen: true }, secret = "synthetic-history-private";
    const row = historyRow({ previousVersion: 1, fromPolicy: { ...before, apiKey: secret, tribeId: randomUUID() }, toPolicy: { ...after, contact: "hidden@example.test", providerBody: secret }, ciphertext: secret });
    const result = mapAdmissionActivityStorage(row.tribe_id, [row], null);
    expect(result.items[0].changes).toEqual({ previousVersion: 1, fromPolicy: before, toPolicy: after });
    expect(JSON.stringify(result)).not.toContain(secret); expect(JSON.stringify(result)).not.toContain("hidden@example.test");
  });
  it("should preserve explicit initialization absence and leave legacy missing snapshots unknown", () => {
    const initialized = historyRow({ previousVersion: null, fromPolicy: null, toPolicy: policySnapshot() });
    expect(mapAdmissionActivityStorage(initialized.tribe_id, [initialized], null).items[0].changes).toEqual(initialized.metadata);
    const legacy = historyRow({});
    expect(mapAdmissionActivityStorage(legacy.tribe_id, [legacy], null).items[0].changes).toEqual({});
  });
  it("should reject an unusable own public policy snapshot and another tribe's row with a controlled contract error", () => {
    const malformed = historyRow({ toPolicy: { ...policySnapshot(), mode: "provider-secret-body" } });
    expect(() => mapAdmissionActivityStorage(malformed.tribe_id, [malformed], null)).toThrow(expect.objectContaining({ code: "public_contract_unusable" }));
    const scoped = historyRow({ toPolicy: policySnapshot() });
    expect(() => mapAdmissionActivityStorage(randomUUID(), [scoped], null)).toThrow(expect.objectContaining({ code: "public_contract_unusable" }));
  });
  it("should require the own DTO guard to reject nested secrets and malformed routing or activation fields", () => {
    expect(admissionActivityChangesSchema.safeParse({ toPolicy: { ...policySnapshot(), apiKey: "synthetic-private" } }).success).toBe(false);
    expect(admissionActivityChangesSchema.safeParse({ toPolicy: { ...policySnapshot(), verificationEpoch: 0 } }).success).toBe(false);
    expect(admissionActivityChangesSchema.safeParse({ toPolicy: { ...policySnapshot(), activatedAt: "provider-body" } }).success).toBe(false);
  });
});
