/** @vitest-environment node */
/** Exercises current native authority and truthful per-row batch projection. @module admission-batch-decisions-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionBatchDecisionWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-batch-decision-writer";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { DecideAdmissionRequestsBatchUseCase } from "@/src/modules/academy-admissions/application/use-cases/decide-admission-requests-batch-use-case";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** @returns Real context resolution with doubles only for the project's account, authorization and atomic writer ports. */
function batchDecisions() {
  const now = new Date("2026-10-15T12:00:00Z"), tribeId = randomUUID(), operationId = randomUUID();
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "synthetic.reviewer@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-15T13:00:00Z") }, googleAccount: null, identityEvidence: null};
  const actor: AdmissionActorFacts = { userId: account.userId, tribeId, role: "guardian", status: "active" };
  const accounts = { getAuthenticatedAccount: vi.fn(async () => account) };
  const resolver = new ResolveAdmissionContextUseCase(accounts, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const decideBatch = vi.fn<AdmissionBatchDecisionWriter["decideBatch"]>();
  const useCase = new DecideAdmissionRequestsBatchUseCase(resolver, { decideBatch });
  const items = [{ admissionRequestId: randomUUID(), expectedVersion: 1 }, { admissionRequestId: randomUUID(), expectedVersion: 3 }];
  const input = { tribeId, operationId, requestId: randomUUID(), confirmed: true as const, decision: "approve" as const, internalReason: "  Motivo interno reservado  ", externalMessage: "  Respuesta externa distinta  ", items };
  return { account, actor, accounts, decideBatch, useCase, input };
}

describe("admission batch decisions application", () => {
  it("should derive mixed counts and restore the explicit selection order when the original has a committed success and conflict", async () => {
    // Given an actual current guardian and original results in canonical resource order.
    const fixture = batchDecisions(), [approved, conflict] = fixture.input.items;
    fixture.decideBatch.mockResolvedValue({ state: "completed", operationId: fixture.input.operationId, replayed: false, result: { results: [
      { admissionRequestId: conflict.admissionRequestId, status: "conflict", code: "request_conflict" },
      { admissionRequestId: approved.admissionRequestId, status: "approved", version: 2 },
    ] } });

    // When the use case projects the original, private notes are not response fields.
    const outcome = await fixture.useCase.execute(fixture.input);

    // Then counts and row order reflect only the explicitly selected confirmed results.
    expect(outcome).toMatchObject({ ok: true, value: { operationId: fixture.input.operationId, state: "completed", result: "mixed", completedCount: 1, failedCount: 1, unresolvedCount: 0, items: [
      { requestId: approved.admissionRequestId, status: "approved", version: 2 },
      { requestId: conflict.admissionRequestId, status: "conflict", code: "request_conflict" },
    ] } });
    if (!outcome.ok) throw new Error("Current batch result projection was unexpectedly denied");
    expect(outcome.value).not.toHaveProperty("internalReason");
    expect(outcome.value).not.toHaveProperty("externalMessage");
    expect(fixture.decideBatch).toHaveBeenCalledWith(expect.objectContaining({ userId: fixture.account.userId, sessionId: fixture.account.session.id, internalReason: "Motivo interno reservado", externalMessage: "Respuesta externa distinta" }));
  });

  it("should publish all_rejected as terminal when every explicit row has an expected business conflict", async () => {
    const fixture = batchDecisions();
    fixture.decideBatch.mockResolvedValue({ state: "completed", operationId: fixture.input.operationId, replayed: true, result: { results: fixture.input.items.map((item) => ({ admissionRequestId: item.admissionRequestId, status: "conflict", code: "request_conflict" })) } });
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ ok: true, value: { state: "completed", result: "all_rejected", completedCount: 0, failedCount: 2, unresolvedCount: 0 } });
  });

  it("should retain only unresolved selected rows when the writer reports genuine registered progress", async () => {
    const fixture = batchDecisions();
    fixture.decideBatch.mockResolvedValue({ state: "started", operationId: fixture.input.operationId });
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ ok: true, value: { state: "started", result: "incomplete", completedCount: 0, failedCount: 0, unresolvedCount: 2, items: fixture.input.items.map((item) => ({ requestId: item.admissionRequestId, status: "unresolved", code: "operation_unresolved" })) } });
  });

  it("should refuse every row before persistence when the current reviewer role has been revoked", async () => {
    const fixture = batchDecisions();
    fixture.actor.status = "removed";
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(fixture.decideBatch).not.toHaveBeenCalled();
  });

  it("should refuse the batch without registering progress when the native session is expired", async () => {
    const fixture = batchDecisions();
    fixture.account.session.expiresAt = new Date("2026-10-15T11:59:59Z");
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(fixture.decideBatch).not.toHaveBeenCalled();
  });

  it("should reject an otherwise valid original containing an unselected resource instead of publishing its result", async () => {
    const fixture = batchDecisions();
    fixture.decideBatch.mockResolvedValue({ state: "completed", operationId: fixture.input.operationId, replayed: false, result: { results: [
      { admissionRequestId: fixture.input.items[0].admissionRequestId, status: "approved", version: 2 },
      { admissionRequestId: randomUUID(), status: "approved", version: 4 },
    ] } });
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should reject a result belonging to another operation even when its selected rows match", async () => {
    const fixture = batchDecisions();
    fixture.decideBatch.mockResolvedValue({ state: "started", operationId: randomUUID() });
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should preserve recorded uncertainty but never invent a registered operation from a generic persistence failure", async () => {
    const fixture = batchDecisions();
    fixture.decideBatch.mockRejectedValueOnce(new AdmissionOperationError("operation_unresolved", { operationId: fixture.input.operationId })).mockRejectedValueOnce(new Error("Controlled persistence failure before a claim"));
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId: fixture.input.operationId, state: "started" } } });
    const failure = await fixture.useCase.execute(fixture.input);
    expect(failure).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
    if (failure.ok) throw new Error("Unregistered persistence failure became a success");
    expect(failure.failure).not.toHaveProperty("operation");
  });

  it("should refuse a foreign registered error identity instead of directing recovery to another operation", async () => {
    const fixture = batchDecisions();
    fixture.decideBatch.mockRejectedValue(new AdmissionOperationError("operation_unresolved", { operationId: randomUUID() }));
    const outcome = await fixture.useCase.execute(fixture.input);
    expect(outcome).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    if (outcome.ok) throw new Error("Foreign batch operation identity was published");
    expect(outcome.failure).not.toHaveProperty("operation");
  });
});
