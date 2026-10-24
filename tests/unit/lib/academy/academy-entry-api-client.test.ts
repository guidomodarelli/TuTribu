/** @vitest-environment node */
/** Exercises real compatibility client parsing without replacing auth/framework/SDK libraries. @module academy-entry-api-client-tests */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { joinAcademy } from "@/lib/academy/academy-api-client";
import { createAdmissionApiClient } from "@/lib/academy-admissions/admission-api-client";

afterEach(() => vi.restoreAllMocks());
describe("academy entry browser adapter", () => {
  it("should preserve a pending request and the exact original POST body instead of consuming it as joined", async () => {
    const operationId = randomUUID(), requestId = randomUUID(), signal = new AbortController().signal;
    const body = { operationId, expectedPolicyVersion: 1, confirmed: true as const, message: "Quiero participar." };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ operationId, outcome: "pending", request: { id: requestId, status: "pending", version: 1, source: "common", submittedAt: "2026-10-07T00:00:00Z", expiresAt: "2026-11-06T00:00:00Z", needsVerification: false, eligibilityReasons: [] }, safeMessage: "Tu solicitud está pendiente." }, { status: 201 }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.submitAcademyEntry("synthetic-academy", body, signal)).toMatchObject({ status: "ready", value: { outcome: "pending", operationId, request: { id: requestId } } });
    expect(fetch).toHaveBeenCalledWith("/api/tribes/synthetic-academy/academy/join", expect.objectContaining({ method: "POST", signal, body: JSON.stringify(body) }));
  });

  it("should preserve network uncertainty and refuse pending as an old direct-membership response", async () => {
    const operationId = randomUUID(), input = { operationId, expectedPolicyVersion: 1, confirmed: true as const };
    const client = createAdmissionApiClient({ fetch: vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new Error("Synthetic transport interruption")), viewer: async () => ({ status: "ready", value: null }) });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ outcome: "pending", operationId, safeMessage: "Tu solicitud está pendiente." }, { status: 201 }));
    expect(await client.submitAcademyEntry("synthetic-academy", input, new AbortController().signal)).toMatchObject({ status: "failed", uncertain: true });
    expect(await joinAcademy("synthetic-academy")).toMatchObject({ isSuccess: false });
  });
});
