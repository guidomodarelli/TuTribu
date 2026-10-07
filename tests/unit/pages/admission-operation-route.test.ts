/** @vitest-environment node */
/** Exercises readonly operation HTTP with genuine own response guards. @module admission-operation-route-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionOperationHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-operation-handler";

describe("admission original operation GET", () => {
  it("should expose recorded progress at 200 without a claim and reject actor/type query overrides", async () => {
    const operationId = randomUUID(), tribeId = randomUUID();
    const read = vi.fn(async () => ({ ok: true as const, value: { type: "submit_admission", state: "started", operationId, leaseOwner: randomUUID() } }));
    const open = vi.fn(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) }, operation: { execute: read } }));
    const handler = createAdmissionOperationHandler(open), context = { params: Promise.resolve({ slug: "synthetic-academy", operationId }) };
    const request = new Request(`https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/operations/${operationId}`);
    const response = await handler(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ type: "submit_admission", state: "started", operationId });
    expect(read).toHaveBeenCalledWith({ tribeId, operationId, requestId: expect.any(String) });
    open.mockClear();
    expect((await handler(new Request(`${request.url}?userId=foreign&type=decide_admission_request`), context)).status).toBe(400);
    expect(open).not.toHaveBeenCalled();
  });

  it("should preserve unavailable operations as a safe error instead of manufacturing accepted progress", async () => {
    const operationId = randomUUID(), handler = createAdmissionOperationHandler(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId: randomUUID() } }) }, operation: { execute: async () => ({ ok: false as const, failure: { code: "resource_unavailable", cause: new Error("Synthetic private registry detail") } }) } }));
    const response = await handler(new Request(`https://tutribu.example.invalid/api/tribes/a/admissions/operations/${operationId}`), { params: Promise.resolve({ slug: "synthetic-academy", operationId }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "resource_unavailable" });
  });
});
