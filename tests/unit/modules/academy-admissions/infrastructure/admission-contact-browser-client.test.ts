/** @vitest-environment node */
/** Exercises real own contact browser contracts using only an explicit HTTP transport boundary. @module admission-contact-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionContactApiClient } from "@/lib/academy-admissions/admission-contact-api-client";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";

describe("admission contact browser client", () => {
  it("should keep POST selection failures readonly and omit private fields from a safe result", async () => {
    const input = { previousRequestId: randomUUID(), expectedPolicyVersion: 2, channel: "email" as const }, transport = vi.fn(async () => Response.json({ code: "dependency_unavailable", message: ADMISSION_ERROR_MESSAGE.dependency_unavailable, requestId: randomUUID() }, { status: 503 }));
    const client = createAdmissionContactApiClient({ fetch: transport });
    expect(await client.current("synthetic-academy", input, new AbortController().signal)).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: false });
    transport.mockResolvedValueOnce(Response.json({ current: null, privateConnection: "private" }));
    expect(await client.current("synthetic-academy", input, new AbortController().signal)).toEqual({ status: "ready", value: { current: null } });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("should issue through same-origin own HTTP with exact consent and canonical original identity", async () => {
    const operationId = randomUUID(), transport = vi.fn(async () => Response.json({ state: "completed", operationId, replayed: false, result: { purpose: "admission", challengeId: randomUUID(), channel: "email", maskedDestination: "a•••@example.test", expiresAt: "2026-10-08T23:10:00Z", resendAllowedAt: "2026-10-08T23:01:00Z", deliveryState: "queued", secretRef: "synthetic-private" } }, { status: 201 }));
    const result = await createAdmissionContactApiClient({ fetch: transport }).issue("synthetic-academy", { operationId, confirmed: true, expectedPolicyVersion: 1, channel: "email" }, new AbortController().signal);
    expect(result).toMatchObject({ status: "ready", value: { state: "completed", result: { purpose: "admission", deliveryState: "queued" } } });
    if (result.status === "ready") expect(result.value).not.toHaveProperty("result.secretRef");
    expect(transport).toHaveBeenCalledWith("/api/tribes/synthetic-academy/admissions/challenges", expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", body: JSON.stringify({ operationId, confirmed: true, expectedPolicyVersion: 1, channel: "email" }), signal: expect.any(AbortSignal) }));
  });

  it("should retain genuine completed progress on 202 and a committed wrong-code failure without exposing provider copy", async () => {
    const operationId = randomUUID(), challengeId = randomUUID(), transport = vi.fn(async () => Response.json({ code: "operation_unresolved", message: ADMISSION_ERROR_MESSAGE.operation_unresolved, requestId: randomUUID(), operation: { operationId, state: "completed" } }, { status: 202 }));
    const client = createAdmissionContactApiClient({ fetch: transport });
    expect(await client.issue("synthetic-academy", { operationId, confirmed: true, expectedPolicyVersion: 1, channel: "email" }, new AbortController().signal)).toMatchObject({ status: "failed", code: "operation_unresolved", uncertain: true, operation: { operationId, state: "completed" } });
    transport.mockResolvedValueOnce(Response.json({ code: "verification_code_incorrect", message: ADMISSION_ERROR_MESSAGE.verification_code_incorrect, requestId: randomUUID(), operation: { operationId, state: "completed" } }, { status: 422 }));
    const denied = await client.verify("synthetic-academy", challengeId, { operationId, confirmed: true, verificationCode: "123456" }, new AbortController().signal);
    expect(denied).toMatchObject({ status: "failed", code: "verification_code_incorrect", uncertain: false, operation: { operationId, state: "completed" } });
    if (denied.status === "failed") expect(denied.message).not.toMatch(/Synthetic private/);
    transport.mockResolvedValueOnce(Response.json({ code: "verification_code_incorrect", message: "Synthetic private upstream copy", requestId: randomUUID() }, { status: 422 }));
    const privateCopy = await client.verify("synthetic-academy", challengeId, { operationId, confirmed: true, verificationCode: "123456" }, new AbortController().signal);
    expect(privateCopy).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    if (privateCopy.status === "failed") expect(privateCopy.message).not.toMatch(/Synthetic private/);
  });

  it("should reject a crossed original or diagnostic proof and keep transport uncertainty distinct from a registered operation", async () => {
    const operationId = randomUUID(), challengeId = randomUUID(), transport = vi.fn(async () => Response.json({ state: "started", operationId: randomUUID() }, { status: 202 })), client = createAdmissionContactApiClient({ fetch: transport });
    expect(await client.resend("synthetic-academy", challengeId, { operationId, confirmed: true }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    transport.mockResolvedValueOnce(Response.json({ state: "completed", operationId, replayed: false, result: { purpose: "connection_diagnostic", result: "verified", diagnosticId: randomUUID(), connectionVersion: 1, channel: "email" } }));
    expect(await client.verify("synthetic-academy", challengeId, { operationId, confirmed: true, verificationCode: "123456" }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    transport.mockRejectedValueOnce(new TypeError("Synthetic response lost"));
    const lost = await client.resend("synthetic-academy", challengeId, { operationId, confirmed: true }, new AbortController().signal);
    expect(lost).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: true });
    expect(lost).not.toHaveProperty("operation");
  });

  it("should validate the exact proof/request/version result and forward cancellation without another request", async () => {
    const operationId = randomUUID(), requestId = randomUUID(), proofId = randomUUID(), transport = vi.fn(async () => Response.json({ state: "completed", operationId, replayed: false, result: { outcome: "applied", requestId: randomUUID(), requestVersion: 2, status: "pending", proofId } })), client = createAdmissionContactApiClient({ fetch: transport });
    expect(await client.apply("synthetic-academy", requestId, { operationId, confirmed: true, expectedVersion: 1, proofId }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    const controller = new AbortController(); controller.abort(); transport.mockClear();
    expect(await client.apply("synthetic-academy", requestId, { operationId, confirmed: true, expectedVersion: 1, proofId }, controller.signal)).toEqual({ status: "aborted" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("should read only the referenced admission transport and safely translate an owned messaging error", async () => {
    const deliveryId = randomUUID(), transport = vi.fn(async () => Response.json({ id: deliveryId, state: "unknown", purpose: "admission", channel: "email", createdAt: "2026-10-08T23:00:00Z", safeReason: "transport_timeout", providerId: "synthetic-private" })), client = createAdmissionContactApiClient({ fetch: transport });
    const current = await client.delivery("synthetic-academy", deliveryId, new AbortController().signal);
    expect(current).toMatchObject({ status: "ready", value: { id: deliveryId, state: "unknown", purpose: "admission" } });
    if (current.status === "ready") expect(current.value).not.toHaveProperty("providerId");
    transport.mockResolvedValueOnce(Response.json({ code: "authentication_required", message: MESSAGING_ERROR_MESSAGE.authentication_required, requestId: randomUUID() }, { status: 401 }));
    expect(await client.delivery("synthetic-academy", deliveryId, new AbortController().signal)).toMatchObject({ status: "failed", code: "authentication_required", uncertain: false });
    transport.mockResolvedValueOnce(Response.json({ id: deliveryId, state: "accepted", purpose: "connection_diagnostic", channel: "email", createdAt: "2026-10-08T23:00:00Z" }));
    expect(await client.delivery("synthetic-academy", deliveryId, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
  });
});
