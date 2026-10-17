/** @vitest-environment node */
/** Exercises real own DTO guards and browser transport ambiguity without replacing SDK or platform modules. @module admission-whatsapp-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionApiClient } from "@/lib/academy-admissions/admission-api-client";

/** @param value - Own public response to serve. @returns A client with only the HTTP/account ports controlled. */
function browserClient(value: unknown) {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }));
  const client = createAdmissionApiClient({ fetch: transport, viewer: async () => ({ status: "ready", value: { id: "synthetic-viewer" } }) });
  return { transport, client };
}

describe("declared WhatsApp browser transport", () => {
  it("should retain private own query fields instead of stripping them with the durable request schema", async () => {
    const request = { id: randomUUID(), status: "pending", version: 2, submittedAt: "2026-10-17T12:00:00.000Z", expiresAt: "2026-11-16T12:00:00.000Z", source: "common", needsVerification: false, eligibilityReasons: [], whatsappNumber: "+14155552671", requiresWhatsappNumber: true };
    const data = browserClient(request);
    expect(await data.client.own("synthetic", request.id, new AbortController().signal)).toEqual({ status: "ready", value: request });
    expect(data.transport).toHaveBeenCalledTimes(1);
  });

  it("should send one canonical own correction and consume only its confirmed lineage", async () => {
    const operationId = randomUUID(), admissionRequestId = randomUUID(), input = { operationId, expectedVersion: 1, confirmed: true as const, whatsappNumber: "+14155552671" };
    const result = { state: "completed", operationId, replayed: false, result: { admissionRequestId, version: 2, changed: true } };
    const data = browserClient({ ...result, result: { ...result.result, whatsappNumber: input.whatsappNumber } });
    expect(await data.client.updateWhatsappNumber("synthetic", admissionRequestId, input, new AbortController().signal)).toEqual({ status: "ready", value: result.result });
    expect(data.transport).toHaveBeenCalledExactlyOnceWith(`/api/tribes/synthetic/admissions/requests/${admissionRequestId}/whatsapp`, expect.objectContaining({ method: "POST", body: JSON.stringify(input), credentials: "same-origin", cache: "no-store" }));
  });

  it.each(["operation", "request", "version"] as const)("should keep a write uncertain when its %s does not match the original intent", async (field) => {
    const operationId = randomUUID(), admissionRequestId = randomUUID(), input = { operationId, expectedVersion: 1, confirmed: true as const, whatsappNumber: null };
    const data = browserClient({ state: "completed", operationId: field === "operation" ? randomUUID() : operationId, replayed: false, result: { admissionRequestId: field === "request" ? randomUUID() : admissionRequestId, version: field === "version" ? 1 : 2, changed: true } });
    expect(await data.client.updateWhatsappNumber("synthetic", admissionRequestId, input, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    expect(data.transport).toHaveBeenCalledTimes(1);
  });

  it("should not retry an unknown transport outcome or expose its private diagnostic", async () => {
    const data = browserClient(null);
    data.transport.mockRejectedValueOnce(new Error("synthetic-private-transport-detail"));
    const result = await data.client.updateWhatsappNumber("synthetic", randomUUID(), { operationId: randomUUID(), expectedVersion: 1, confirmed: true, whatsappNumber: null }, new AbortController().signal);
    expect(result).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: true });
    expect(JSON.stringify(result)).not.toContain("synthetic-private-transport-detail");
    expect(data.transport).toHaveBeenCalledTimes(1);
  });

  it("should ignore a cancelled operation before issuing a request", async () => {
    const data = browserClient(null), controller = new AbortController(); controller.abort();
    expect(await data.client.updateWhatsappNumber("synthetic", randomUUID(), { operationId: randomUUID(), expectedVersion: 1, confirmed: true, whatsappNumber: null }, controller.signal)).toEqual({ status: "aborted" });
    expect(data.transport).not.toHaveBeenCalled();
  });
});
