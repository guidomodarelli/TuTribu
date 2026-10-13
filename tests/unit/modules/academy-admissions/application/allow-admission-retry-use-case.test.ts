/** @vitest-environment node */
/** Exercises exact sensitive retry scope and own writer delegation without platform mocks. @module allow-admission-retry-use-case-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AllowAdmissionRetryUseCase } from "@/src/modules/academy-admissions/application/use-cases/allow-admission-retry-use-case";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";

describe("allow admission retry application", () => {
  it("should request exact global retry recency and use the current context rather than a caller's role or account", async () => {
    const tribeId = randomUUID(), admissionRequestId = randomUUID(), operationId = randomUUID();
    const context: AuthorizedAdmissionContext = { userId: randomUUID(), sessionId: randomUUID(), tribeId, requestId: randomUUID(), action: "allow_early_retry", role: "leader", membershipStatus: "active", resourceId: admissionRequestId, sensitiveOperation: "advance_admission_retry", authenticatedAt: new Date(), validUntil: new Date(Date.now() + 60_000) };
    const resolver = { execute: vi.fn(async () => ({ allowed: true as const, context })) };
    const writer = { allowRetry: vi.fn(async () => ({ state: "completed" as const, operationId, replayed: false, result: { admissionRequestId, version: 3, retryAllowedAt: "2026-10-07T00:00:00Z" } })) };
    const input = { tribeId, admissionRequestId, operationId, requestId: context.requestId, expectedVersion: 2, confirmed: true as const, internalReason: "Corrección" };
    expect(await new AllowAdmissionRetryUseCase(resolver, writer).execute(input)).toMatchObject({ ok: true, value: { result: { version: 3 } } });
    expect(resolver.execute).toHaveBeenCalledWith({ tribeId, requestId: context.requestId, action: "allow_early_retry", sensitiveOperation: "advance_admission_retry", resource: { kind: "admission_request", id: admissionRequestId } });
    expect(writer.allowRetry).toHaveBeenCalledWith({ ...input, userId: context.userId, sessionId: context.sessionId });
  });

  it("should preserve a current permission/recency denial before calling the writer", async () => {
    const writer = { allowRetry: vi.fn() };
    const resolver = { execute: vi.fn(async () => ({ allowed: false as const, failure: { code: "reauthentication_required" as const } })) };
    expect(await new AllowAdmissionRetryUseCase(resolver, writer).execute({ tribeId: randomUUID(), admissionRequestId: randomUUID(), operationId: randomUUID(), requestId: randomUUID(), expectedVersion: 2, confirmed: true, internalReason: "Corrección" })).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    expect(writer.allowRetry).not.toHaveBeenCalled();
  });
});
