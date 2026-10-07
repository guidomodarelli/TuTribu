/** Exercises current authority and cutover projection with doubles only of the owned inventory port. @module preflight-admission-activation-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PreflightAdmissionActivationUseCase } from "@/src/modules/academy-admissions/application/use-cases/preflight-admission-activation-use-case";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionActivationInventory } from "@/src/modules/academy-admissions/domain/policies/admission-activation-preflight";

/** Actual resolver has no recency; private inventory does not constitute reusable permission. */
function fixture() {
  const tribeId = randomUUID(), userId = randomUUID(), now = new Date("2026-10-07T08:00:00Z");
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-08T08:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const facts: AdmissionActivationInventory = { tribeId, isAcademy: true, policyPresent: true, markerConsistent: true, storagePrepared: true, ingressProtected: true, runtimePrepared: false, unknownCommercialMemberCount: 1, privilegedCommercialMemberCount: 0 };
  const inventory = { read: vi.fn(async () => facts) };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  return { actor, facts, inventory, query: { tribeId, requestId: randomUUID() }, useCase: new PreflightAdmissionActivationUseCase(resolver, inventory) };
}

describe("informational cutover preflight", () => {
  it("should return current aggregate blockers without repairing history or exposing private inventory", async () => {
    const data = fixture(), original = { ...data.facts };
    expect(await data.useCase.execute(data.query)).toEqual({ ok: true, value: { prepared: false, reasons: ["preflight_unknown_commercial_history", "preflight_runtime_unavailable"], impact: { unknownCommercialMemberCount: 1, privilegedCommercialMemberCount: 0 } } });
    expect(data.facts).toEqual(original);
  });

  it("should deny a guardian before inventory and revoke a leader's preview if authority changes during its read", async () => {
    const data = fixture(); data.actor.role = "guardian";
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.inventory.read).not.toHaveBeenCalled();
    data.actor.role = "leader";
    data.inventory.read.mockImplementationOnce(async () => { data.actor.role = "guardian"; return data.facts; });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
  });

  it("should reject another tribe's inventory and invalid counts as an unusable owned contract", async () => {
    const data = fixture();
    data.inventory.read.mockResolvedValueOnce({ ...data.facts, tribeId: randomUUID() });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    data.inventory.read.mockResolvedValueOnce({ ...data.facts, unknownCommercialMemberCount: -1 });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
});
