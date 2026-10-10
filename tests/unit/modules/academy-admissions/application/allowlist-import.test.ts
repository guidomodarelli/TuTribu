/** Exercises real native-fact authorization and CSV parsing over import-owned repository ports. @module allowlist-import-use-case-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ImportAllowlistUseCases } from "@/src/modules/academy-admissions/application/use-cases/import-allowlist-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import type { AllowlistImportRepository } from "@/src/modules/academy-admissions/domain/repositories/allowlist-import-repository";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** @returns Real authorization/parsing with only project-owned account/storage ports doubled. */
function fixture() {
  const now = new Date("2026-10-09T08:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), importId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: sessionId, expiresAt: new Date("2026-10-10T08:00:00Z") }, googleAccount: { id: accountId, subject }, identityEvidence: null, recentAuthentication: [] };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async (_tribeId, resource) => resource.id === importId ? { id: importId, tribeId } : null }, () => now);
  const repository: AllowlistImportRepository = { preview: vi.fn<AllowlistImportRepository["preview"]>(async (input) => ({ state: "started", operationId: input.operationId })), read: vi.fn<AllowlistImportRepository["read"]>(async () => null), confirm: vi.fn<AllowlistImportRepository["confirm"]>(async (input) => ({ state: "started", operationId: input.operationId })) };
  const inputReader = { parse: vi.fn(parseAllowlistCsv) };
  /** @param operation - Exact signed operation. @param resourceId - Current resource binding. @returns After seeding owned native resolver evidence. */
  const sign = (operation: string, resourceId = tribeId) => { account.recentAuthentication = [{ id: randomUUID(), intentId: randomUUID(), userId, sessionId, accountId, subject, tribeId, resourceId, operation, authenticatedAt: now, verifiedAt: now, validUntil: new Date("2026-10-09T08:09:00Z"), invalidatedAt: null }]; };
  return { repository, inputReader, actor, account, importId, sign, useCases: new ImportAllowlistUseCases(resolver, repository, inputReader), input: { tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true as const, expectedPolicyVersion: 1, contactType: "email" as const, csvText: "identity,display_name\nfirst.last+tag@example.test,Grupo" } };
}

describe("allowlist import use cases", () => {
  it("should require exact preview recency before parsing or storing any file", async () => {
    const data = fixture();
    expect(await data.useCases.preview(data.input)).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    expect(data.inputReader.parse).not.toHaveBeenCalled(); expect(data.repository.preview).not.toHaveBeenCalled();
    data.sign(REAUTHENTICATION_OPERATION.previewAllowlistImport);
    expect(await data.useCases.preview(data.input)).toMatchObject({ ok: true, value: { state: "started", operationId: data.input.operationId } });
    expect(data.repository.preview).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ userId: data.account.userId, resourceId: data.input.tribeId, sensitiveOperation: "preview_allowlist_import" }), rows: [{ rowNumber: 1, identity: "first.last+tag@example.test", displayName: "Grupo" }] }));
  });

  it("should reject malformed input without invoking persistence after current authorization", async () => {
    const data = fixture(); data.sign(REAUTHENTICATION_OPERATION.previewAllowlistImport);
    expect(await data.useCases.preview({ ...data.input, csvText: "bad header" })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(data.repository.preview).not.toHaveBeenCalled();
  });

  it("should deny a guardian before reading another contact list or accepting an import", async () => {
    const data = fixture(); data.actor.role = "guardian";
    expect(await data.useCases.read({ ...data.input, importId: data.importId })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(await data.useCases.preview(data.input)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.repository.read).not.toHaveBeenCalled(); expect(data.repository.preview).not.toHaveBeenCalled();
  });

  it("should keep the explicit version and rows tied to confirmation of this exact import", async () => {
    const data = fixture(), input = { tribeId: data.input.tribeId, requestId: data.input.requestId, operationId: randomUUID(), importId: data.importId, expectedVersion: 3, selectedRows: [1, 2], confirmed: true as const };
    data.sign(REAUTHENTICATION_OPERATION.confirmAllowlistImport);
    expect(await data.useCases.confirm(input)).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    expect(data.repository.confirm).not.toHaveBeenCalled();
    data.sign(REAUTHENTICATION_OPERATION.confirmAllowlistImport, data.importId);
    expect(await data.useCases.confirm(input)).toMatchObject({ ok: true, value: { state: "started" } });
    expect(data.repository.confirm).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 3, selectedRows: [1, 2], context: expect.objectContaining({ resourceId: data.importId, sensitiveOperation: "confirm_allowlist_import" }) }));
  });

  it("should return only genuine unresolved original metadata without presenting a failed block as success", async () => {
    const data = fixture(), operationId = randomUUID(); data.sign(REAUTHENTICATION_OPERATION.confirmAllowlistImport, data.importId);
    vi.mocked(data.repository.confirm).mockRejectedValue(new AdmissionOperationError("operation_unresolved", { operationId, cause: new Error("Private storage failure") }));
    const result = await data.useCases.confirm({ ...data.input, importId: data.importId, operationId, expectedVersion: 1, selectedRows: [1] });
    expect(result).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId, state: "started" } } });
    expect(JSON.stringify(result)).not.toContain("Private storage");
  });
});
