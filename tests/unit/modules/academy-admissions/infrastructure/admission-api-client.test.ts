/** @vitest-environment node */
/** Exercises native Response, own Zod DTOs and only an explicit HTTP transport boundary. @module admission-api-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

describe("admission browser API", () => {
  it("should treat a completed original business denial as definitive and keep a registered started failure uncertain", async () => {
    const operationId = randomUUID(), fetch = vi.fn<typeof globalThis.fetch>();
    for (const state of ["completed", "started"] as const) fetch.mockResolvedValueOnce(Response.json({ code: "admission_ineligible", message: "Falta un requisito actual para resolver el ingreso. Consultá el estado de la solicitud.", requestId: randomUUID(), operation: { operationId, state } }, { status: 409 }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    const input = { operationId, confirmed: true as const, expectedPolicyVersion: 1 };
    expect(await client.submit("synthetic-academy", input, new AbortController().signal)).toMatchObject({ status: "failed", code: "admission_ineligible", uncertain: false });
    expect(await client.submit("synthetic-academy", input, new AbortController().signal)).toMatchObject({ status: "failed", code: "admission_ineligible", uncertain: true });
  });
  it("should retain the original intent when a terminal error belongs to another operation", async () => {
    const fetch = vi.fn(async () => Response.json({ code: "admission_ineligible", message: "Falta un requisito actual para resolver el ingreso. Consultá el estado de la solicitud.", requestId: randomUUID(), operation: { operationId: randomUUID(), state: "completed" } }, { status: 409 }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.submit("synthetic-academy", { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1 }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
  });
  it("should retain the original write after a safe server failure that carries no registered operation", async () => {
    const fetch = vi.fn(async () => Response.json({ code: ADMISSION_ERROR_CODE.unexpectedFailure, message: ADMISSION_ERROR_MESSAGE.unexpected_failure, requestId: randomUUID() }, { status: 500 }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.submit("synthetic-academy", { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1 }, new AbortController().signal)).toMatchObject({ status: "failed", uncertain: true, code: "unexpected_failure" });
  });

  it("should reject an unusable successful write and wrong original operation without claiming rollback", async () => {
    const operationId = randomUUID(), fetch = vi.fn(async () => Response.json({ state: "started", operationId: randomUUID() }, { status: 202 }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.submit("synthetic-academy", { operationId, confirmed: true, expectedPolicyVersion: 1 }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    expect(fetch).toHaveBeenCalledWith("/api/tribes/synthetic-academy/admissions/submissions", expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) }));
  });

  it("should preserve ambiguous transport writes but keep a safe pre-action rejection definitive", async () => {
    const operationId = randomUUID(), fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new Error("Synthetic private transport detail")).mockResolvedValueOnce(Response.json({ code: ADMISSION_ERROR_CODE.invalidInput, message: ADMISSION_ERROR_MESSAGE.invalid_input, requestId: randomUUID() }, { status: 400 }));
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) }), input = { operationId, confirmed: true as const, expectedPolicyVersion: 1 };
    expect(await client.submit("synthetic-academy", input, new AbortController().signal)).toMatchObject({ status: "failed", uncertain: true, code: "dependency_unavailable" });
    expect(await client.submit("synthetic-academy", input, new AbortController().signal)).toMatchObject({ status: "failed", uncertain: false, code: "invalid_input" });
  });

  it("should query an explicit own history item, strip review detail and treat cancellation without error feedback", async () => {
    const requestId = randomUUID(), controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ id: requestId, version: 2, status: "rejected", source: "common", submittedAt: "2026-10-07T01:00:00Z", expiresAt: "2026-11-06T01:00:00Z", needsVerification: false, eligibilityReasons: [], internalReason: "Private note", secretReference: "private" })).mockImplementationOnce(async () => { controller.abort(); throw new Error("Synthetic aborted read"); });
    const client = createAdmissionApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    const result = await client.own("synthetic-academy", requestId, new AbortController().signal);
    expect(result).toMatchObject({ status: "ready", value: { id: requestId, status: "rejected", version: 2 } });
    expect(JSON.stringify(result)).not.toContain("Private note");
    expect(JSON.stringify(result)).not.toContain("secretReference");
    expect(await client.own("synthetic-academy", requestId, controller.signal)).toEqual({ status: "aborted" });
  });
});
