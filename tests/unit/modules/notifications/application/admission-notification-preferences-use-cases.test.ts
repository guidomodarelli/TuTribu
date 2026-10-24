/** @vitest-environment node */
/** Exercises current reviewer authority and own-recipient scope through the real admission resolver. @module admission-notification-preferences-use-cases-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AdmissionNotificationPreferencesUseCases } from "@/src/modules/notifications/application/use-cases/admission-notification-preferences-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionNotificationPreferenceRepository } from "@/src/modules/notifications/domain/repositories/admission-notification-preference-repository";
import { resolveAdmissionNotificationPreference, planAdmissionNotificationPreferenceChange } from "@/src/modules/notifications/domain/policies/admission-notification-preference";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** @returns Native authority resolution with a controlled owned storage port; platform libraries remain real. */
function fixture() {
  const now = new Date("2026-10-15T19:00:00Z");
  const tribeId = randomUUID(), userId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "reviewer@example.invalid", session: { id: randomUUID(), expiresAt: new Date("2026-10-15T20:00:00Z") }, googleAccount: null, identityEvidence: null};
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const current = () => ({ tribeId, recipientUserId: userId, currentRole: actor.role, membershipStatus: actor.status });
  const repository: AdmissionNotificationPreferenceRepository = {
    getOwn: vi.fn(async () => resolveAdmissionNotificationPreference(current(), null)),
    changeOwn: vi.fn(async (_scope, change) => planAdmissionNotificationPreferenceChange(current(), null, change, "2026-10-15 19:00:00.123456+00")),
  };
  return { account, actor, repository, query: { tribeId, requestId: randomUUID() }, useCases: new AdmissionNotificationPreferencesUseCases(resolver, repository) };
}

describe("own admission notification preferences", () => {
  // Read authority comes from the current account and role; no sensitive operation or email resource is required.
  it.each([{ role: "leader", mode: "grouped", canConfigureEmail: true }, { role: "guardian", mode: "omitted", canConfigureEmail: false }] as const)("should resolve the $role default when no preference has been stored", async ({ role, mode, canConfigureEmail }) => {
    const data = fixture();
    data.actor.role = role;

    const result = await data.useCases.read(data.query);

    expect(result).toMatchObject({ ok: true, value: { preference: { mode, version: 0, source: "implicit", effectiveFrom: null }, canConfigureEmail } });
    expect(data.repository.getOwn).toHaveBeenCalledWith({ userId: data.account.userId, sessionId: data.account.session.id, tribeId: data.query.tribeId });
    expect(data.repository.changeOwn).not.toHaveBeenCalled();
  });

  it("should save only the current guardian preference when browser identity fields are present on the caller object", async () => {
    const data = fixture();
    data.actor.role = "guardian";
    const input = { ...data.query, mode: "daily" as const, expectedVersion: 0, userId: randomUUID(), sessionId: randomUUID() };

    const result = await data.useCases.change(input);

    expect(result).toMatchObject({ ok: true, value: { status: "changed", preference: { recipientUserId: data.account.userId, mode: "daily", version: 1 } } });
    expect(data.repository.changeOwn).toHaveBeenCalledWith({ userId: data.account.userId, sessionId: data.account.session.id, tribeId: data.query.tribeId }, { mode: "daily", expectedVersion: 0 });
  });

  // Permission loss must stop before a private preference can be observed or changed.
  it.each([{ role: "tribemate", status: "active" }, { role: "guardian", status: "muted" }] as const)("should deny storage access when the current actor is $status $role", async ({ role, status }) => {
    const data = fixture();
    Object.assign(data.actor, { role, status });

    expect(await data.useCases.read(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(await data.useCases.change({ ...data.query, mode: "daily", expectedVersion: 0 })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.repository.getOwn).not.toHaveBeenCalled();
    expect(data.repository.changeOwn).not.toHaveBeenCalled();
  });

  it.each(["read", "change"] as const)("should close the private result when %s returns another recipient scope", async (operation) => {
    const data = fixture();
    const foreign = { tribeId: randomUUID(), recipientUserId: randomUUID(), mode: "daily" as const, version: 1, effectiveFrom: "2026-10-15 19:00:00.123456+00" };
    vi.mocked(data.repository.getOwn).mockResolvedValue({ status: "resolved", preference: { ...foreign, source: "stored" } });
    vi.mocked(data.repository.changeOwn).mockResolvedValue({ status: "changed", preference: foreign });

    const result = operation === "read" ? await data.useCases.read(data.query) : await data.useCases.change({ ...data.query, mode: "daily", expectedVersion: 0 });

    expect(result).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    expect(JSON.stringify(result)).not.toContain(foreign.recipientUserId);
  });

  it("should preserve expected denials and private causes when the owned storage port fails", async () => {
    const data = fixture();
    vi.mocked(data.repository.getOwn).mockRejectedValue(new AdmissionOperationError("permission_denied"));
    vi.mocked(data.repository.changeOwn).mockRejectedValue(new Error("Synthetic private preference failure"));

    expect(await data.useCases.read(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(await data.useCases.change({ ...data.query, mode: "daily", expectedVersion: 0 })).toMatchObject({ ok: false, failure: { code: "unexpected_failure", cause: expect.any(Error) } });
  });
});
