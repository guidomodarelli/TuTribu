/** @vitest-environment node */
/** Exercises native account and original proof attachment contracts through the application boundary. @module apply-admission-proof-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { ApplyAdmissionProofUseCase } from "@/src/modules/academy-admissions/application/use-cases/apply-admission-proof-use-case";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** Supplies only native identity and an own atomic attachment port; no provider or platform implementation is replaced. */
function proofFixture() {
  const now = new Date("2026-10-08T22:00:00Z");
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "applicant@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-08T23:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const input = { tribeId: randomUUID(), requestId: randomUUID(), admissionRequestId: randomUUID(), operationId: randomUUID(), proofId: randomUUID(), expectedRequestVersion: 1 };
  const confirmed = { state: "completed", operationId: input.operationId, replayed: false, result: { outcome: "applied", requestId: input.admissionRequestId, requestVersion: 2, status: "pending", proofId: input.proofId } };
  const operations = { apply: vi.fn(async (): Promise<unknown> => confirmed) };
  return { now, account, accounts, input, confirmed, operations };
}

describe("apply original admission proof", () => {
  it("should treat uppercase request, proof and original operation UUIDs as the same committed identity", async () => {
    const fixture = proofFixture(), input = { ...fixture.input, admissionRequestId: fixture.input.admissionRequestId.toUpperCase(), proofId: fixture.input.proofId.toUpperCase(), operationId: fixture.input.operationId.toUpperCase() };
    expect(await new ApplyAdmissionProofUseCase(fixture.accounts, fixture.operations, () => fixture.now).execute(input)).toEqual({ ok: true, value: fixture.confirmed });
    fixture.operations.apply.mockRejectedValueOnce(new AdmissionOperationError("operation_unresolved", { operationId: fixture.input.operationId }));
    expect(await new ApplyAdmissionProofUseCase(fixture.accounts, fixture.operations, () => fixture.now).execute(input)).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId: fixture.input.operationId, state: "started" } } });
  });
  it("should derive native identity and allowlist the attachment proposal without caller contact or permissions", async () => {
    const fixture = proofFixture(), useCase = new ApplyAdmissionProofUseCase(fixture.accounts, fixture.operations, () => fixture.now);
    const injected = { ...fixture.input, userId: randomUUID(), sessionId: randomUUID(), purpose: "connection_diagnostic", contact: "foreign@example.test", verified: true, bypass: true };
    const result = await useCase.execute(injected);
    expect(result).toEqual({ ok: true, value: fixture.confirmed });
    expect(fixture.operations.apply).toHaveBeenCalledWith({ ...fixture.input, userId: fixture.account.userId, sessionId: fixture.account.session.id, purpose: "admission" });
  });

  it("should reject absent or expired native identity before attachment", async () => {
    const fixture = proofFixture(), useCase = new ApplyAdmissionProofUseCase(fixture.accounts, fixture.operations, () => fixture.now);
    fixture.accounts.getAuthenticatedAccount.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...fixture.account, session: { ...fixture.account.session, expiresAt: fixture.now } });
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(fixture.operations.apply).not.toHaveBeenCalled();
  });

  it("should preserve registered progress and committed denial without manufacturing success", async () => {
    const fixture = proofFixture(), useCase = new ApplyAdmissionProofUseCase(fixture.accounts, fixture.operations, () => fixture.now);
    fixture.operations.apply.mockResolvedValueOnce({ state: "started", operationId: fixture.input.operationId });
    expect(await useCase.execute(fixture.input)).toEqual({ ok: true, value: { state: "started", operationId: fixture.input.operationId } });
    fixture.operations.apply.mockResolvedValueOnce({ state: "completed", operationId: fixture.input.operationId, replayed: true, result: { outcome: "denied", code: "contact_binding_conflict" } });
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "contact_binding_conflict", operation: { operationId: fixture.input.operationId, state: "completed" } } });
  });

  it("should reject a crossed original, proof or request and safely retain original transport uncertainty", async () => {
    const fixture = proofFixture(), useCase = new ApplyAdmissionProofUseCase(fixture.accounts, fixture.operations, () => fixture.now);
    for (const wrong of [{ ...fixture.confirmed, operationId: randomUUID() }, { ...fixture.confirmed, result: { ...fixture.confirmed.result, proofId: randomUUID() } }, { ...fixture.confirmed, result: { ...fixture.confirmed.result, requestId: randomUUID() } }, { ...fixture.confirmed, result: { ...fixture.confirmed.result, requestVersion: 4 } }]) {
      fixture.operations.apply.mockResolvedValueOnce(wrong);
      expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    }
    fixture.operations.apply.mockRejectedValueOnce(new AdmissionOperationError("operation_unresolved", { operationId: fixture.input.operationId, cause: new Error("Synthetic private commit uncertainty") }));
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId: fixture.input.operationId, state: "started" } } });
    fixture.operations.apply.mockRejectedValueOnce(new AdmissionOperationError("operation_unresolved", { operationId: randomUUID() }));
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
});
