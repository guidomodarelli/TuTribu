/** Exercises same-origin policy transport and owned DTO semantics without SDK/platform mocks. @module admission-policy-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionApiClient } from "@/lib/academy-admissions/admission-api-client";

/** Replaces only the feature-owned HTTP and viewer ports; real Request/Response/Zod remain in use. */
function fixture() {
  const operationId = randomUUID(), policyId = randomUUID();
  const result = { state: "completed", operationId, replayed: false, result: { policyId, version: 4, verificationEpoch: 2, activatedAt: null, controlActivated: false, changed: true } };
  const transport = vi.fn<typeof globalThis.fetch>(async () => Response.json(result));
  const client = createAdmissionApiClient({ fetch: transport, viewer: async () => ({ status: "ready", value: { id: "synthetic-leader" } }) });
  const draft = { operationId, confirmed: true as const, expectedVersion: 3, mode: "manual_review" as const, contactType: "email" as const, isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: true, phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null };
  return { result, transport, client, draft, signal: new AbortController().signal };
}

describe("policy browser transport", () => {
  it("should send one exact PUT intent and preserve its original counter without a route refresh or additional request", async () => {
    const data = fixture();
    expect(await data.client.updatePolicy("synthetic-academy", data.draft, data.signal)).toMatchObject({ status: "ready", value: { operationId: data.draft.operationId, result: { version: 4 } } });
    expect(data.transport).toHaveBeenCalledOnce();
    const [url, options] = data.transport.mock.calls[0];
    expect(url).toBe("/api/tribes/synthetic-academy/admissions/policy");
    expect(options).toMatchObject({ method: "PUT", credentials: "same-origin", cache: "no-store", signal: data.signal });
    expect(JSON.parse(String(options?.body))).toEqual(data.draft);
  });

  it("should preserve uncertainty for malformed or incoherent writes without retrying them", async () => {
    const data = fixture();
    data.transport.mockResolvedValueOnce(Response.json({ ...data.result, result: { ...data.result.result, version: 1 } }));
    expect(await data.client.updatePolicy("synthetic-academy", data.draft, data.signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    data.transport.mockRejectedValueOnce(new TypeError("Synthetic response loss"));
    expect(await data.client.updatePolicy("synthetic-academy", data.draft, data.signal)).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: true });
    expect(data.transport).toHaveBeenCalledTimes(2);
  });

  it("should keep read failures distinct from mutations and cancel before starting an already aborted request", async () => {
    const data = fixture();
    data.transport.mockResolvedValueOnce(Response.json({ prepared: false, reasons: ["preflight_runtime_unavailable"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } }));
    expect(await data.client.readPreflight("synthetic-academy", data.signal)).toMatchObject({ status: "ready", value: { prepared: false } });
    data.transport.mockResolvedValueOnce(Response.json({ unexpected: true }));
    expect(await data.client.readPolicy("synthetic-academy", data.signal)).toMatchObject({ status: "failed", uncertain: false });
    const aborted = new AbortController(); aborted.abort();
    expect(await data.client.updatePolicy("synthetic-academy", data.draft, aborted.signal)).toEqual({ status: "aborted" });
    expect(data.transport).toHaveBeenCalledTimes(2);
  });
});
