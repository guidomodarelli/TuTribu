/** Exercises current identity derivation and safe progress from owned ports, without SDK mocks. */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ResolveAdmissionOperationUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-operation-use-case";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";

const command = { tribeId: randomUUID(), operationType: "update_allowlist_entry", idempotencyKey: randomUUID(), intent: { expectedVersion: 1, displayName: "Primero" } };
const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "synthetic@example.test", session: { id: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000) }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };

describe("resolve admission operation", () => {
  it("should derive actor from the current account despite an extra client identity", async () => {
    const resolve = vi.fn(async () => ({ state: "started" as const, operationId: command.idempotencyKey }));
    const useCase = new ResolveAdmissionOperationUseCase({ getAuthenticatedAccount: async () => account }, { resolve });
    const hostile = { ...command, actorUserId: randomUUID() };
    expect(await useCase.execute(hostile)).toMatchObject({ ok: true, value: { state: "started", operationId: command.idempotencyKey } });
    expect(resolve).toHaveBeenCalledWith({ ...command, actorUserId: account.userId });
  });

  it("should reject a missing global session without claiming or mutating", async () => {
    const resolve = vi.fn();
    const useCase = new ResolveAdmissionOperationUseCase({ getAuthenticatedAccount: async () => null }, { resolve });
    expect(await useCase.execute(command)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("should preserve the registered operation after an indeterminate completion", async () => {
    const error = new AdmissionOperationError("operation_unresolved", { operationId: command.idempotencyKey, cause: new Error("Private commit failure") });
    const useCase = new ResolveAdmissionOperationUseCase({ getAuthenticatedAccount: async () => account }, { resolve: async () => { throw error; } });
    expect(await useCase.execute(command)).toEqual({ ok: false, failure: { code: "operation_unresolved", cause: error, operation: { operationId: command.idempotencyKey, state: "started" } } });
  });

  it("should not invent durable progress for an unrelated exception", async () => {
    const useCase = new ResolveAdmissionOperationUseCase({ getAuthenticatedAccount: async () => { throw new Error("Private lookup failure"); } }, { resolve: vi.fn() });
    const result = await useCase.execute(command);
    expect(result).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
    if (!result.ok) expect(result.failure).not.toHaveProperty("operation");
  });
});
