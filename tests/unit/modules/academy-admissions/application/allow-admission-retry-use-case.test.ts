/** @vitest-environment node */
/** Exercises exact sensitive retry scope and own writer delegation without platform mocks. @module allow-admission-retry-use-case-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AllowAdmissionRetryUseCase } from "@/src/modules/academy-admissions/application/use-cases/allow-admission-retry-use-case";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";

describe("allow admission retry application", () => {
  it("should request the exact retry operation and use the current context rather than a caller's role or account", async () => {
    const tribeId = randomUUID(), admissionRequestId = randomUUID(), operationId = randomUUID();
    const context: AuthorizedAdmissionContext = { userId: randomUUID(), sessionId: randomUUID(), tribeId, requestId: randomUUID(), action: "allow_early_retry", role: "leader", membershipStatus: "active", resourceId: admissionRequestId, sensitiveOperation: "advance_admission_retry" };
    const resolver = { execute: vi.fn(async () => ({ allowed: true as const, context })) };
    const writer = { allowRetry: vi.fn(async () => ({ state: "completed" as const, operationId, replayed: false, result: { admissionRequestId, version: 3, retryAllowedAt: "2026-10-07T00:00:00Z" } })) };
    const input = { tribeId, admissionRequestId, operationId, requestId: context.requestId, expectedVersion: 2, confirmed: true as const, internalReason: "Corrección" };
    expect(await new AllowAdmissionRetryUseCase(resolver, writer).execute(input)).toMatchObject({ ok: true, value: { result: { version: 3 } } });
    expect(resolver.execute).toHaveBeenCalledWith({ tribeId, requestId: context.requestId, action: "allow_early_retry", sensitiveOperation: "advance_admission_retry", resource: { kind: "admission_request", id: admissionRequestId } });
    expect(writer.allowRetry).toHaveBeenCalledWith({ ...input, userId: context.userId, sessionId: context.sessionId });
  });

  it("should preserve a current permission denial before calling the writer", async () => {
    const writer = { allowRetry: vi.fn() };
    const resolver = { execute: vi.fn(async () => ({ allowed: false as const, failure: { code: "permission_denied" as const } })) };
    expect(await new AllowAdmissionRetryUseCase(resolver, writer).execute({ tribeId: randomUUID(), admissionRequestId: randomUUID(), operationId: randomUUID(), requestId: randomUUID(), expectedVersion: 2, confirmed: true, internalReason: "Corrección" })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(writer.allowRetry).not.toHaveBeenCalled();
  });

  it.each(["active_session", "expired_session", "guardian"] as const)("should resolve the retry through the real context resolver with %s and no recent confirmation", async (scenario) => {
    const now = new Date("2026-10-19T12:00:00Z"), tribeId = randomUUID(), admissionRequestId = randomUUID(), operationId = randomUUID();
    const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "synthetic.leader@example.test", session: { id: randomUUID(), expiresAt: scenario === "expired_session" ? now : new Date("2026-10-19T13:00:00Z") }, googleAccount: { id: randomUUID(), subject: randomUUID() }, identityEvidence: null };
    const actor: AdmissionActorFacts = { userId: account.userId, tribeId, role: scenario === "guardian" ? "guardian" : "leader", status: "active" };
    const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => structuredClone(account) }, {
      getCurrentActor: async () => ({ ...actor }),
      getResource: async () => ({ id: admissionRequestId, tribeId, applicantUserId: randomUUID() }),
    }, () => now);
    const writer = { allowRetry: vi.fn(async () => ({ state: "completed" as const, operationId, replayed: false, result: { admissionRequestId, version: 3, retryAllowedAt: "2026-10-19T12:00:00Z" } })) };
    const result = await new AllowAdmissionRetryUseCase(resolver, writer).execute({ tribeId, admissionRequestId, operationId, requestId: randomUUID(), expectedVersion: 2, confirmed: true, internalReason: "Corrección" });
    if (scenario === "active_session") {
      expect(result).toMatchObject({ ok: true, value: { result: { version: 3 } } });
      expect(writer.allowRetry).toHaveBeenCalledWith(expect.objectContaining({ userId: account.userId, sessionId: account.session.id }));
      return;
    }
    expect(result).toMatchObject({ ok: false, failure: { code: scenario === "expired_session" ? "authentication_required" : "permission_denied" } });
    expect(writer.allowRetry).not.toHaveBeenCalled();
  });
});
