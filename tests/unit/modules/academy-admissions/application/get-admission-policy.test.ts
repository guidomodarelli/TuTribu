/** Exercises current policy projection through actual authority with doubles only of owned storage/fact ports. @module get-admission-policy-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionPolicyUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-use-case";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { AdmissionPolicyState } from "@/src/modules/academy-admissions/domain/repositories/admission-policy-management";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionPolicyViewFacts } from "@/src/modules/academy-admissions/domain/repositories/admission-policy-management";

/** Supplies true absence and an actual global account, with no recency or mutation owner. */
function fixture() {
  const tribeId = randomUUID(), userId = randomUUID(), now = new Date("2026-10-07T07:00:00Z");
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-08T07:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const current: AdmissionPolicyState = { policy: null, controlActivated: false, usage: null };
  const reader = { read: vi.fn(async () => current) }, facts = { read: vi.fn(async (): Promise<AdmissionPolicyViewFacts> => ({ pendingRequestCount: 3, preparation: null })) };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  return { tribeId, actor, current, reader, facts, query: { tribeId, requestId: randomUUID() }, useCase: new GetAdmissionPolicyUseCase(resolver, reader, facts) };
}

describe("current admission policy view", () => {
  it("should reject a foreign country owner or policy entity before reading informational facts", async () => {
    const data = fixture();
    data.current.policy = createDefaultAdmissionPolicy({ id: data.tribeId, tribeId: data.tribeId });
    data.current.usage = { tribeId: randomUUID(), version: 4, allowedCountries: ["GB"], platformRestrictions: [] };
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    expect(data.facts.read).not.toHaveBeenCalled();
    data.current.usage = null;
    data.current.policy = { ...data.current.policy, tribeId: randomUUID() };
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    expect(data.facts.read).not.toHaveBeenCalled();
    data.current.policy = createDefaultAdmissionPolicy({ id: data.tribeId, tribeId: data.tribeId });
    data.reader.read.mockResolvedValueOnce(data.current).mockResolvedValueOnce({ ...data.current, usage: { tribeId: randomUUID(), version: 4, allowedCountries: ["GB"], platformRestrictions: [] } });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should expose true absence without a fake version, creation or claimed preflight readiness", async () => {
    const data = fixture(), result = await data.useCase.execute(data.query);
    expect(result).toMatchObject({ ok: true, value: { state: "not_configured", policy: null, usage: null, controlActivated: false, preparation: { state: "not_evaluated" }, impact: { pendingRequestCount: 3, historicalLinksProtected: false, contactTypeLocked: false } } });
    expect(data.reader.read).toHaveBeenCalledTimes(2);
    if (result.ok) expect(result.value).not.toHaveProperty("version");
  });

  it("should represent missing protected policy as unavailable and retain its irreversible protection", async () => {
    const data = fixture(); data.current.controlActivated = true;
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { state: "unavailable", policy: null, controlActivated: true, impact: { historicalLinksProtected: true, contactTypeLocked: true } } });
  });

  it("should project independent phone OFF draft, one country owner and its visible invitation warning", async () => {
    const data = fixture();
    data.current.policy = { ...createDefaultAdmissionPolicy({ id: data.tribeId, tribeId: data.tribeId }), contactType: "phone" };
    data.current.usage = { tribeId: data.tribeId, version: 4, allowedCountries: ["AR"], platformRestrictions: [] };
    const result = await data.useCase.execute(data.query);
    expect(result).toMatchObject({ ok: true, value: { state: "draft", policy: { requiresAdditionalVerification: false, activatedAt: null, version: 1, usage: { version: 4, allowedCountries: ["AR"] } }, usage: { version: 4, allowedCountries: ["AR"] }, impact: { warnings: ["phone_invitations_unavailable"], historicalLinksProtected: false } } });
    if (result.ok) expect(result.value.policy).not.toHaveProperty("tribeId");
  });

  it("should deny a guardian before owned facts and reject policy changes during the informational read", async () => {
    const data = fixture(); data.actor.role = "guardian";
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.reader.read).not.toHaveBeenCalled();
    expect(data.facts.read).not.toHaveBeenCalled();
    data.actor.role = "leader";
    data.reader.read.mockResolvedValueOnce(data.current).mockResolvedValueOnce({ ...data.current, policy: createDefaultAdmissionPolicy({ id: data.tribeId, tribeId: data.tribeId }) });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "policy_conflict" } });
  });

  it("should project only safe current preparation reasons and keep owner routing metadata out of the DTO", async () => {
    const data = fixture();
    data.current.policy = { ...createDefaultAdmissionPolicy({ id: data.tribeId, tribeId: data.tribeId }), requiresAdditionalVerification: true };
    data.facts.read.mockResolvedValue({ pendingRequestCount: 4, preparation: { tribeId: data.tribeId, isAcademy: true, controlActivated: false, preflightComplete: false, evaluatorEnabled: false, recoveryLocked: true, configuration: { tribeId: data.tribeId, channelPrepared: false, verificationQuotaPositive: true, usagePolicy: null } } });
    const result = await data.useCase.execute(data.query);
    expect(result).toMatchObject({ ok: true, value: { state: "draft", preparation: { state: "evaluated", requirements: ["admission_preflight_incomplete", "admission_evaluator_unavailable", "admission_recovery_locked", "verification_unavailable"] }, impact: { pendingRequestCount: 4, historicalLinksProtected: false } } });
    if (result.ok) {
      expect(result.value.preparation).not.toHaveProperty("configuration");
      expect(result.value.preparation).not.toHaveProperty("tribeId");
    }
    data.facts.read.mockResolvedValue({ pendingRequestCount: 4, preparation: { tribeId: randomUUID(), isAcademy: true, controlActivated: false, preflightComplete: true, evaluatorEnabled: true, recoveryLocked: false, configuration: { tribeId: data.tribeId, channelPrepared: true, verificationQuotaPositive: true, usagePolicy: null } } });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
});
