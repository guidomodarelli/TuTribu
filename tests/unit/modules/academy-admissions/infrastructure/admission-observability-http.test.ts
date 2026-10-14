/** Exercises real native HTTP/own DTO guards with small application port doubles only. @module admission-observability-http-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionActivityHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-activity-handlers";
import { mapAdmissionActivityStorage } from "@/src/modules/academy-admissions/infrastructure/repositories/admission-activity-storage-mapper";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { MESSAGE_STORAGE_OPERATION } from "@/src/modules/messaging/constants/message-delivery";
import { admissionActivityQuerySchema } from "@/src/modules/academy-admissions/constants/admission-activity-schemas";

describe("private observability HTTP", () => {
  it.each([VERIFICATION_ISSUANCE_OPERATION.issue, VERIFICATION_ISSUANCE_OPERATION.resend, MESSAGE_STORAGE_OPERATION.authorize, MESSAGE_STORAGE_OPERATION.complete, MESSAGE_STORAGE_OPERATION.reconcile])("should preserve the implemented producer rule %s in its selected activity", (rule) => {
    const tribeId = randomUUID();
    const page = mapAdmissionActivityStorage(tribeId, [{ id: randomUUID(), tribe_id: tribeId, actor_user_id: null, operation_id: null, tribe_lifecycle_operation_id: null,
      resource_type: "message_delivery", resource_id: randomUUID(), event_type: "delivery_created", rule, cause: null, resource_version: 1,
      metadata: {}, created_at: new Date(), cursor_at: "2026-10-14T13:00:00.000001Z" }], null);
    expect(page.items[0].rule).toBe(rule);
  });
  it.each(["?role=leader", "?limit=51", "?limit=1e1", "?cursor=invalid", "?resourceType=account"])("should reject %s before opening auth/database composition", async (query) => {
    let opened = 0;
    const handlers = createAdmissionActivityHandlers(async () => { opened += 1; throw new Error("Unreachable synthetic composition"); });
    const response = await handlers.activity(new Request(`https://tutribu.example.test/api/tribes/test/admissions/activity${query}`), { params: Promise.resolve({ slug: "test" }) });
    expect(response.status).toBe(400); expect(opened).toBe(0); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "invalid_input" });
  });
  it("should preserve microsecond cursor precision and reject alternate actor or scope inputs", () => {
    const id = randomUUID(), at = "2026-10-14T13:00:00.000002Z";
    expect(admissionActivityQuerySchema.parse({ cursor: `${at}|${id}` })).toMatchObject({ cursor: { at, id } });
    expect(admissionActivityQuerySchema.safeParse({ userId: randomUUID() }).success).toBe(false);
    expect(admissionActivityQuerySchema.safeParse({ tribeId: randomUUID() }).success).toBe(false);
  });
  it("should return only owned selected facts with private headers and correlation, never source extras", async () => {
    const tribeId = randomUUID(), resourceId = randomUUID(), eventId = randomUUID();
    const page = mapAdmissionActivityStorage(tribeId, [{ id: eventId, tribe_id: tribeId, actor_user_id: null, operation_id: null, tribe_lifecycle_operation_id: null,
      resource_type: "admission_request", resource_id: resourceId, event_type: "proof_attached", rule: "private-note", cause: "private-cause", resource_version: 2,
      metadata: { proofId: randomUUID(), previousVersion: 1, apiKey: "private-key", recipient: "synthetic@example.test", verificationCode: "private-otp" }, created_at: "2026-10-14T13:00:00.000001Z", cursor_at: "2026-10-14T13:00:00.000001Z" }], null);
    const handlers = createAdmissionActivityHandlers(async () => ({ resolveTribe: { async execute() { return { ok: true, value: { tribeId } }; } }, observations: { async activity() { return { ok: true, value: page }; }, async metrics() { return { ok: false, failure: { code: "permission_denied" } }; } } }));
    const response = await handlers.activity(new Request("https://tutribu.example.test/api/tribes/test/admissions/activity"), { params: Promise.resolve({ slug: "test" }) });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-request-id")).toBeTruthy(); expect(response.headers.get("x-trace-id")).toBeTruthy();
    const value = await response.json(); expect(value).toEqual(page);
    for (const marker of ["private-note", "private-cause", "private-key", "private-otp", "synthetic@example.test"]) expect(JSON.stringify(value)).not.toContain(marker);
  });
  it("should close a foreign own result and preserve a current permission denial without serializing private causes", async () => {
    const tribeId = randomUUID(), privateMarker = randomUUID();
    const handlers = createAdmissionActivityHandlers(async () => ({ resolveTribe: { async execute() { return { ok: true, value: { tribeId } }; } }, observations: {
      async activity() { return { ok: false, failure: { code: "permission_denied", cause: new Error(privateMarker) } }; },
      async metrics() { return { ok: false, failure: { code: "authentication_required" } }; },
    } }));
    const response = await handlers.activity(new Request("https://tutribu.example.test/api/tribes/test/admissions/activity"), { params: Promise.resolve({ slug: "test" }) });
    expect(response.status).toBe(403); expect(await response.text()).not.toContain(privateMarker);
    expect(() => mapAdmissionActivityStorage(tribeId, [{ id: randomUUID(), tribe_id: randomUUID(), actor_user_id: null, operation_id: null, tribe_lifecycle_operation_id: null, resource_type: "admission_request", resource_id: null, event_type: "cancelled", rule: null, cause: null, resource_version: 2, metadata: {}, created_at: new Date(), cursor_at: "2026-10-14T13:00:00.000Z" }], null)).toThrow(expect.objectContaining({ code: "public_contract_unusable" }));
  });
});
