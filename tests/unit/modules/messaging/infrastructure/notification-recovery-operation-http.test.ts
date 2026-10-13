/** @vitest-environment node */
/** Exercises the real original recovery GET boundary without platform mocks. @module notification-recovery-operation-http-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createNotificationRecoveryOperationHandler } from "@/src/modules/messaging/infrastructure/api/notification-recovery-operation-handler";

describe("original notification recovery HTTP read", () => {
  it("should return no-store original metadata and reject a different returned UUID", async () => {
    const operationId = randomUUID(), tribeId = randomUUID();
    let returnedId = operationId, reads = 0;
    const handler = createNotificationRecoveryOperationHandler(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) }, operation: { execute: async () => { reads += 1; return { ok: true as const, value: { type: "recover_notification_delivery" as const, state: "started" as const, operationId: returnedId, replayed: true as const } }; } } }));
    const request = new Request(`https://app.example.test/api/tribes/synthetic/notification-recovery-operations/${operationId}`), context = { params: Promise.resolve({ slug: "synthetic", operationId }) };
    const response = await handler(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ type: "recover_notification_delivery", state: "started", operationId, replayed: true });
    returnedId = randomUUID();
    const wrong = await handler(request, context);
    expect(wrong.status).toBe(500);
    expect(await wrong.json()).toMatchObject({ code: "public_contract_unusable" });
    expect(reads).toBe(2);
  });

  it("should reject namespace, actor or retry query flags before opening services", async () => {
    let opens = 0;
    const handler = createNotificationRecoveryOperationHandler(async () => { opens += 1; throw new Error("Forbidden original operation query"); });
    const operationId = randomUUID();
    for (const query of ["?actorUserId=foreign", "?operationType=save_messaging_credentials", "?retry=true"]) {
      const response = await handler(new Request(`https://app.example.test/api/tribes/synthetic/notification-recovery-operations/${operationId}${query}`), { params: Promise.resolve({ slug: "synthetic", operationId }) });
      expect(response.status).toBe(400);
    }
    expect(opens).toBe(0);
  });
});
