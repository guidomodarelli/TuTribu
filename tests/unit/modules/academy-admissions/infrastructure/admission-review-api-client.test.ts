/** @vitest-environment node */
/** Exercises native own HTTP DTO guards and reviewer mutation ambiguity through the transport port. @module admission-review-api-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import type { AdmissionBrowserBatchDecision } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionBatchResultDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";

/** @returns One explicit public batch command and its matching committed acknowledgement. */
function batchFixture() {
  const input: AdmissionBrowserBatchDecision = { operationId: randomUUID(), confirmed: true, decision: "approve", internalReason: "Revisión del lote", items: [{ requestId: randomUUID(), expectedVersion: 1 }, { requestId: randomUUID(), expectedVersion: 3 }] };
  const value: AdmissionBatchResultDto = { operationId: input.operationId, state: "completed", result: "all_succeeded", completedCount: 2, failedCount: 0, unresolvedCount: 0, items: input.items.map((item) => ({ requestId: item.requestId, status: "approved", version: item.expectedVersion + 1, safeMessage: "Solicitud aprobada." })) };
  return { input, value };
}

describe("reviewer own browser contracts", () => {
  it("should reject a substituted detail id and strip provider fields from a valid review list", async () => {
    const requestId = randomUUID();
    const review = { id: randomUUID(), status: "pending", version: 1, submittedAt: "2026-10-07T00:00:00Z", expiresAt: "2026-11-06T00:00:00Z", source: "common", needsVerification: false, pendingAgeThresholdReached: false, eligibilityReasons: [], applicant: { id: "synthetic-account", name: "Solicitante" }, evidence: { kind: "none" }, eligibleActions: ["reject"], restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null }, providerToken: "synthetic-private-field" };
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

describe("explicit reviewer batch transport", () => {
  it("should send only the explicit command when local names or unrelated fields are present", async () => {
    const data = batchFixture(), signal = new AbortController().signal;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ ...data.value, providerToken: "synthetic-private-response", items: data.value.items.map((item) => ({ ...item, providerToken: "synthetic-private-row" })) }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    const result = await client.decideBatch("synthetic-academy", { ...data.input, items: data.input.items.map((item) => ({ ...item, applicantName: "Nombre exclusivamente local" })) }, signal);
    expect(result).toEqual({ status: "ready", value: data.value });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/tribes/synthetic-academy/admissions/request-decisions", expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", signal }));
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(data.input);
    expect(JSON.stringify(result)).not.toContain("providerToken");
  });

  it.each(["operation", "selection", "version", "decision", "cancelled", "partial_started", "missing_row"])("should retain uncertainty when the batch acknowledgement substitutes %s", async (variant) => {
    const data = batchFixture(), value = structuredClone(data.value);
    if (variant === "operation") value.operationId = randomUUID();
    if (variant === "selection") value.items[0].requestId = randomUUID();
    if (variant === "version") value.items[0].version = 99;
    if (variant === "decision") value.items = value.items.map((item) => ({ ...item, status: "rejected" }));
    if (variant === "cancelled") value.items[0].status = "cancelled";
    if (variant === "missing_row") { value.items.pop(); value.completedCount = 1; }
    if (variant === "partial_started") { value.state = "started"; value.result = "incomplete"; value.completedCount = 1; value.unresolvedCount = 1; value.items[1] = { requestId: data.input.items[1].requestId, status: "unresolved", code: "operation_unresolved", safeMessage: "Sin resolución confirmada." }; }
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(value));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.decideBatch("synthetic-academy", data.input, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("should expose all rejected rows as a terminal result when no decision was applied", async () => {
    const data = batchFixture();
    const value: AdmissionBatchResultDto = { ...data.value, result: "all_rejected", completedCount: 0, failedCount: 2, items: data.input.items.map((item) => ({ requestId: item.requestId, status: "conflict", code: "request_conflict", safeMessage: "La solicitud cambió." })) };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(value));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.decideBatch("synthetic-academy", data.input, new AbortController().signal)).toEqual({ status: "ready", value });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("should preserve registered unresolved work when the atomic original is still started", async () => {
    const data = batchFixture();
    const value: AdmissionBatchResultDto = { ...data.value, state: "started", result: "incomplete", completedCount: 0, unresolvedCount: 2, items: data.input.items.map((item) => ({ requestId: item.requestId, status: "unresolved", code: "operation_unresolved", safeMessage: "Sin resolución confirmada." })) };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(value, { status: 202 }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.decideBatch("synthetic-academy", data.input, new AbortController().signal)).toEqual({ status: "ready", value });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("should avoid transport when the original batch signal was already aborted", async () => {
    const data = batchFixture(), controller = new AbortController(), fetch = vi.fn<typeof globalThis.fetch>();
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    controller.abort();
    expect(await client.decideBatch("synthetic-academy", data.input, controller.signal)).toEqual({ status: "aborted" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
