/** Exercises the real native-context resolver and independent email action with doubles only of owned ports. @module admission-email-settings-use-cases-test */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AdmissionNotificationEmailSettingsUseCases } from "@/src/modules/notifications/application/use-cases/admission-notification-email-settings-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionNotificationEmailSettingsRepository } from "@/src/modules/notifications/domain/repositories/admission-notification-email-settings-repository";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** @returns A real context resolver with the live leader session and controllable notification-owner storage only. */
function fixture() {
  const now = new Date("2026-10-15T17:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), subject = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "synthetic@example.invalid", session: { id: randomUUID(), expiresAt: new Date("2026-10-15T18:00:00Z") }, googleAccount: { id: accountId, subject }, identityEvidence: null};
  const actor: AdmissionActorFacts = { tribeId, userId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const repository: AdmissionNotificationEmailSettingsRepository = {
    get: vi.fn(async () => ({ tribeId, enabled: false, version: 0, enabledAtMicroseconds: null, timeZone: "America/Argentina/Buenos_Aires" })),
    change: vi.fn(async (_context, command) => ({ state: "started" as const, operationId: command.operationId })),
  };
  return { actor, account, repository, useCases: new AdmissionNotificationEmailSettingsUseCases(resolver, repository), query: { tribeId, requestId: randomUUID() }, command: { operationId: randomUUID(), confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "America/Argentina/Buenos_Aires" } };
}

describe("independent admission email authority", () => {
  // A normal current query does not initialize defaults.
  it("should resolve read-only OFF settings without writing configuration", async () => {
    const data = fixture();
    expect(await data.useCases.read(data.query)).toMatchObject({ ok: true, value: { enabled: false, version: 0 } });
    expect(data.repository.change).not.toHaveBeenCalled();
  });

  it("should deny guardian metadata and configuration before touching email storage", async () => {
    const data = fixture();
    data.actor.role = "guardian";
    expect(await data.useCases.read(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(await data.useCases.change({ ...data.query, ...data.command })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.repository.get).not.toHaveBeenCalled();
    expect(data.repository.change).not.toHaveBeenCalled();
  });

  it("should change with the active leader session alone, bind its exact email purpose and preserve the original confirmed intent", async () => {
    const data = fixture(), input = { ...data.query, ...data.command };
    expect(await data.useCases.change(input)).toEqual({ ok: true, value: { state: "started", operationId: data.command.operationId } });
    expect(data.repository.change).toHaveBeenCalledWith(expect.objectContaining({ userId: data.account.userId, sessionId: data.account.session.id, resourceId: data.query.tribeId, sensitiveOperation: "update_admission_email_settings" }), data.command);
  });

  it("should reject an expired session before touching email storage", async () => {
    const data = fixture(); data.account.session.expiresAt = new Date("2026-10-15T17:00:00Z");
    expect(await data.useCases.change({ ...data.query, ...data.command })).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(data.repository.change).not.toHaveBeenCalled();
  });

  it("should distinguish registered uncertain completion from an unrelated private storage failure", async () => {
    const data = fixture();
    vi.mocked(data.repository.change).mockRejectedValueOnce(new AdmissionOperationError("operation_unresolved", { operationId: data.command.operationId }));
    expect(await data.useCases.change({ ...data.query, ...data.command })).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { state: "started", operationId: data.command.operationId } } });
    vi.mocked(data.repository.get).mockRejectedValueOnce(new Error("Synthetic private storage diagnostic"));
    const failed = await data.useCases.read(data.query);
    expect(failed).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
    if (failed.ok) throw new Error("Expected safe application failure");
    expect(failed.failure).toEqual({ code: "unexpected_failure", cause: expect.any(Error) });
    expect(failed.failure.operation).toBeUndefined();
  });
});
