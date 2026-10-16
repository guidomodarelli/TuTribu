/** @vitest-environment node */
/** Exercises readonly operation HTTP with genuine own response guards. @module admission-operation-route-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionOperationHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-operation-handler";
import { ADMISSION_BATCH_DECISION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-batch-decision";

describe("admission original operation GET", () => {
  it.each(["started", "completed"] as const)("should expose only the registered %s batch original through the existing no-store GET", async (state) => {
    const operationId = randomUUID(), snapshot = { results: [{ admissionRequestId: randomUUID(), status: "rejected", version: 2 }, { admissionRequestId: randomUUID(), status: "conflict", code: "request_conflict" }] };
    const value = state === "started" ? { type: ADMISSION_BATCH_DECISION_OPERATION, state, operationId } : { type: ADMISSION_BATCH_DECISION_OPERATION, state, operationId, replayed: true, result: snapshot };
    const handler = createAdmissionOperationHandler(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId: randomUUID() } }) }, operation: { execute: async () => ({ ok: true as const, value }) } }));
    const response = await handler(new Request(`https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/operations/${operationId}`), { params: Promise.resolve({ slug: "synthetic-academy", operationId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(value);
  });

  it.each([
    { purpose: "admission", result: "verified", proofId: randomUUID(), applyBefore: "2026-10-08T19:00:00Z" },
    { purpose: "admission", result: "denied", code: "verification_code_incorrect" },
  ])("should preserve completed local verification over HTTP without private material: $result", async (snapshot) => {
    const operationId = randomUUID(), handler = createAdmissionOperationHandler(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId: randomUUID() } }) }, operation: { execute: async () => ({ ok: true as const, value: { type: "verify_contact_challenge", state: "completed", operationId, replayed: true, result: { ...snapshot, privateMac: "synthetic-private" } } }) } }));
    const response = await handler(new Request(`https://tutribu.example.invalid/api/tribes/a/admissions/operations/${operationId}`), { params: Promise.resolve({ slug: "synthetic-academy", operationId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: "verify_contact_challenge", state: "completed", operationId, replayed: true, result: snapshot });
  });

  it("should expose recorded progress at 200 without a claim and reject actor/type query overrides", async () => {
    const operationId = randomUUID(), tribeId = randomUUID();
    const viewerId = randomUUID(), read = vi.fn(async () => ({ ok: true as const, viewerId, value: { type: "submit_admission", state: "started", operationId, leaseOwner: randomUUID() } }));
    const open = vi.fn(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) }, operation: { execute: read } }));
    const handler = createAdmissionOperationHandler(open), context = { params: Promise.resolve({ slug: "synthetic-academy", operationId }) };
    const request = new Request(`https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/operations/${operationId}`);
    const response = await handler(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ type: "submit_admission", state: "started", operationId });
    expect(read).toHaveBeenCalledWith({ tribeId, operationId, requestId: expect.any(String) }, { includeViewer: true });
    expect(JSON.parse(response.headers.get("x-tutribu-admission-viewer")!)).toEqual({ viewerId });
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
