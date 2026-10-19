/** Exercises actual policy orchestration and authority with doubles only of owned ports. @module manage-admission-policy-use-cases-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManageAdmissionPolicyUseCases } from "@/src/modules/academy-admissions/application/use-cases/manage-admission-policy-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionPolicyCommandWriter, AdmissionPolicyStateReader } from "@/src/modules/academy-admissions/domain/repositories/admission-policy-management";

/** Supplies actual resolver facts while replacing only feature-owned storage ports. */
function fixture() {
  const now = new Date("2026-10-07T01:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), operationId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: sessionId, expiresAt: new Date("2026-10-08T01:00:00Z") }, googleAccount: { id: accountId, subject }, identityEvidence: null};
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const reader: AdmissionPolicyStateReader = { read: vi.fn(async () => ({ policy: null, controlActivated: false, usage: null })) };
  const writer: AdmissionPolicyCommandWriter = { initialize: vi.fn(async () => ({ state: "started" as const, operationId })), update: vi.fn(async () => ({ state: "started" as const, operationId })), activate: vi.fn(async () => ({ state: "started" as const, operationId })), pause: vi.fn(async () => ({ state: "started" as const, operationId })) };
  return { account, actor, reader, writer, useCases: new ManageAdmissionPolicyUseCases(resolver, reader, writer), input: { tribeId, requestId: randomUUID(), operationId, confirmed: true as const, expectedVersion: 3 } };
}

describe("policy management authority", () => {
  it("should read true policy absence for a current leader without initializing storage", async () => {
    const data = fixture();
    expect(await data.useCases.read(data.input)).toEqual({ ok: true, value: { policy: null, controlActivated: false, usage: null } });
    expect(data.reader.read).toHaveBeenCalledWith(expect.objectContaining({ userId: data.account.userId, sessionId: data.account.session.id, role: "leader", action: "read_policy" }));
    expect(data.writer.initialize).not.toHaveBeenCalled();
    expect(data.writer.activate).not.toHaveBeenCalled();
  });

  it("should deny guardian metadata and writes before any own repository is called", async () => {
    const data = fixture(); data.actor.role = "guardian";
    expect(await data.useCases.read(data.input)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(await data.useCases.update({ ...data.input, patch: { isOpen: true } })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.reader.read).not.toHaveBeenCalled();
    expect(data.writer.update).not.toHaveBeenCalled();
  });

  it("should update with the active leader session alone and keep the original UUID/version/patch", async () => {
    const data = fixture(), input = { ...data.input, patch: { requiresAdditionalVerification: true } };
    expect(await data.useCases.update(input)).toMatchObject({ ok: true, value: { state: "started", operationId: input.operationId } });
    expect(data.writer.update).toHaveBeenCalledOnce();
    expect(data.writer.update).toHaveBeenCalledWith({ context: expect.objectContaining({ userId: data.account.userId, sessionId: data.account.session.id, sensitiveOperation: "update_admission_policy", resourceId: data.input.tribeId }), operationId: input.operationId, expectedVersion: 3, patch: input.patch, confirmed: true, type: "update_admission_policy" });
  });

  it("should keep explicit creation version-free and activation/pause isolated to their own operation scope", async () => {
    const data = fixture();
    await data.useCases.initialize(data.input);
    expect(data.writer.initialize).toHaveBeenCalledWith({ context: expect.any(Object), operationId: data.input.operationId, confirmed: true, type: "initialize_admission_policy" });
    await data.useCases.activate(data.input);
    expect(data.writer.activate).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ sensitiveOperation: "activate_admission_policy" }), operationId: data.input.operationId, expectedVersion: 3, type: "activate_admission_policy" }));
    await data.useCases.pause({ ...data.input, reason: "  Revisión de la gestión  " });
    expect(data.writer.pause).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ sensitiveOperation: "pause_admission_policy" }), reason: "Revisión de la gestión", expectedVersion: 3, type: "pause_admission_policy" }));
  });

  it("should reject an expired session before any write", async () => {
    const data = fixture(); data.account.session.expiresAt = new Date("2026-10-07T01:00:00Z");
    expect(await data.useCases.update({ ...data.input, patch: { isOpen: true } })).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(await data.useCases.activate(data.input)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(data.writer.update).not.toHaveBeenCalled(); expect(data.writer.activate).not.toHaveBeenCalled();
  });
});
