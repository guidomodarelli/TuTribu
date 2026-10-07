/** @vitest-environment node */
/** Exercises native own HTTP DTO guards and reviewer mutation ambiguity through the transport port. @module admission-review-api-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionApiClient } from "@/lib/academy-admissions/admission-api-client";

describe("reviewer own browser contracts", () => {
  it("should reject a substituted detail id and strip provider fields from a valid review list", async () => {
    const requestId = randomUUID();
    const review = { id: randomUUID(), status: "pending", version: 1, submittedAt: "2026-10-07T00:00:00Z", expiresAt: "2026-11-06T00:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], applicant: { id: "synthetic-account", name: "Solicitante" }, evidence: { kind: "none" }, eligibleActions: ["reject"], restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null }, providerToken: "synthetic-private-field" };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(review)).mockResolvedValueOnce(Response.json({ items: [review], nextCursor: null }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.reviewDetail("synthetic-academy", requestId, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
    const page = await client.reviewList("synthetic-academy", null, new AbortController().signal);
    expect(page.status).toBe("ready");
    expect(JSON.stringify(page)).not.toContain("providerToken");
  });

  it("should retain the original decision as uncertain for a mismatched result version/status or an unrelated started UUID", async () => {
    const requestId = randomUUID(), operationId = randomUUID(), input = { operationId, confirmed: true as const, expectedVersion: 1, decision: "approve" as const, internalReason: "Revisión" };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ admissionRequestId: requestId, status: "approved", version: 3 })).mockResolvedValueOnce(Response.json({ admissionRequestId: requestId, status: "rejected", version: 2 })).mockResolvedValueOnce(Response.json({ state: "started", operationId: randomUUID() }, { status: 202 }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    for (let index = 0; index < 3; index += 1) expect(await client.decide("synthetic-academy", requestId, input, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
  });
});
