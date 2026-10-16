/** @vitest-environment node */
/** Exercises native own HTTP DTO guards and reviewer mutation ambiguity through the transport port. @module admission-review-api-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "@/src/modules/academy-admissions/constants/admission-public-contract";

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

  it.each(["pending", undefined] as const)("should retain explicit filters and false when reading another scanned page for status %s", async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ items: [], nextCursor: null }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    const signal = new AbortController().signal, cursor = `2026-10-07T00:00:00.123456Z${ADMISSION_REVIEW_CURSOR_SEPARATOR}${randomUUID()}`;
    const filters = { limit: 25, status, source: "common" as const, search: "Ana + García", needsVerification: false, requiresExceptionReason: true, submittedFrom: "2026-10-01T00:00:00Z", submittedUntil: "2026-10-08T00:00:00Z" };
    expect(await client.reviewList("synthetic-academy", cursor, signal, filters)).toEqual({ status: "ready", value: { items: [], nextCursor: null } });
    expect(fetch).toHaveBeenCalledOnce();
    const [href, options] = fetch.mock.calls[0];
    const query = new URL(String(href), "https://tutribu.example.invalid").searchParams;
    expect(Object.fromEntries(query)).toEqual({ limit: "25", ...(status ? { status } : {}), cursor, source: "common", search: filters.search, needsVerification: "false", requiresExceptionReason: "true", submittedFrom: filters.submittedFrom, submittedUntil: filters.submittedUntil });
    expect(options).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", signal });
  });
});
