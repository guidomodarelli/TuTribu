/** @vitest-environment node */
/** Exercises native HTTP validation and minimal own command results with application-port doubles. @module admission-whatsapp-handler-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionWhatsappNumberHandler, type AdmissionWhatsappNumberServices } from "@/src/modules/academy-admissions/infrastructure/api/admission-whatsapp-number-handler";

/** @returns A real Request/Response handler with only application operations replaced. */
function whatsappHandler() {
  const tribeId = randomUUID(), admissionRequestId = randomUUID(), operationId = randomUUID();
  const input = { operationId, expectedVersion: 2, confirmed: true, whatsappNumber: "+14155552671" };
  const resolve = vi.fn<AdmissionWhatsappNumberServices["resolveTribe"]["execute"]>().mockResolvedValue({ ok: true, value: { tribeId } });
  const execute = vi.fn<AdmissionWhatsappNumberServices["updateWhatsappNumber"]["execute"]>().mockResolvedValue({ ok: true, value: { state: "completed", operationId, replayed: false, result: { admissionRequestId, version: 3, changed: true } } });
  const open = vi.fn(async (): Promise<AdmissionWhatsappNumberServices> => ({ resolveTribe: { execute: resolve }, updateWhatsappNumber: { execute } }));
  const handler = createAdmissionWhatsappNumberHandler(open);
  return { tribeId, admissionRequestId, operationId, input, open, execute,
    send: (body: unknown = input, origin = "https://tutribu.example.test") => handler(new Request(`https://tutribu.example.test/api/tribes/synthetic/admissions/requests/${admissionRequestId}/whatsapp`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) }), { params: Promise.resolve({ slug: "synthetic", requestId: admissionRequestId }) }) };
}

describe("own WhatsApp HTTP command", () => {
  it.each([{ userId: "foreign" }, { proofId: "foreign" }, { expectedVersion: 0 }, { confirmed: false }])("should reject forbidden or invalid input before opening application services: %j", async (extra) => {
    const data = whatsappHandler();
    const response = await data.send({ ...data.input, ...extra });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input" });
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should reject another origin before application or database access", async () => {
    const data = whatsappHandler();
    expect((await data.send(data.input, "https://foreign.example.test")).status).toBe(403);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should return only original operation lineage and bind the resource to server routing", async () => {
    const data = whatsappHandler();
    const value = { state: "completed" as const, operationId: data.operationId, replayed: false, result: { admissionRequestId: data.admissionRequestId, version: 3, changed: true, whatsappNumber: data.input.whatsappNumber } };
    data.execute.mockResolvedValue({ ok: true, value });
    const response = await data.send();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "completed", operationId: data.operationId, replayed: false, result: { admissionRequestId: data.admissionRequestId, version: 3, changed: true } });
    expect(data.execute).toHaveBeenCalledWith({ ...data.input, tribeId: data.tribeId, admissionRequestId: data.admissionRequestId, requestId: expect.any(String) });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("should retain genuine registered progress without inventing a completed edit", async () => {
    const data = whatsappHandler();
    data.execute.mockResolvedValue({ ok: true, value: { state: "started", operationId: data.operationId } });
    const response = await data.send();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "started", operationId: data.operationId });
  });

  it.each(["operation", "resource", "version"] as const)("should reject an unrelated or inconsistent %s outcome", async (field) => {
    const data = whatsappHandler();
    data.execute.mockResolvedValue({ ok: true, value: { state: "completed", operationId: field === "operation" ? randomUUID() : data.operationId, replayed: false, result: { admissionRequestId: field === "resource" ? randomUUID() : data.admissionRequestId, version: field === "version" ? 2 : 3, changed: true } } });
    const response = await data.send();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "public_contract_unusable" });
  });
});
