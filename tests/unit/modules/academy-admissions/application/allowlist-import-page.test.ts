/** Exercises current leader SSR import props through the existing real policy loader and new minimum projection. @module allowlist-import-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionPolicyPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-page-use-case";
import { GetAdmissionPolicyUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-use-case";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import { loadAdmissionPolicyPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-policy-page";
import { presentAllowlistImportPage } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";

/** @returns Real inward readers with own account/storage ports and no file, ledger or provider effect. */
function fixture() {
  const now = new Date("2026-10-09T08:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "synthetic-leader@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-10T08:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async () => account) }, actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase(accounts, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const reader = { read: vi.fn(async () => ({ policy: createDefaultAdmissionPolicy({ id: tribeId, tribeId }), controlActivated: false, usage: null })) };
  const policy = new GetAdmissionPolicyUseCase(resolver, reader, { read: async () => ({ pendingRequestCount: 0, preparation: null }) });
  const resolveTribe = new ResolveAdmissionTribeUseCase({ readIdentity: async () => ({ id: tribeId, slug: "synthetic" }) });
  const loader = new GetAdmissionPolicyPageUseCase(accounts, { policy, resolveTribe }, () => now);
  const read = async () => presentAllowlistImportPage(await loadAdmissionPolicyPageState({ params: { slug: "synthetic" }, query: {} }, async () => loader));
  return { reader, read, actor, account, accounts, tribeId, now };
}
describe("minimum import SSR scope", () => {
  it("should keep the current positive policy version and native viewer while excluding connections, usage and session payloads", async () => {
    const data = fixture();
    expect(await data.read()).toEqual({ kind: "ready", slug: "synthetic", tribeId: data.tribeId, viewerId: data.account.userId, renderedAt: data.now.toISOString(), policyVersion: 1, contactType: "email" });
    expect(data.reader.read).toHaveBeenCalledTimes(2);
  });
  it("should close current guardian access and a changed native session before returning private props", async () => {
    const data = fixture(); data.actor.role = "guardian";
    expect(await data.read()).toMatchObject({ kind: "unavailable", code: "permission_denied" }); expect(data.reader.read).not.toHaveBeenCalled();
    data.actor.role = "leader";
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce(data.account).mockResolvedValueOnce({ ...data.account, session: { ...data.account.session, id: randomUUID() } });
    expect(await data.read()).toMatchObject({ kind: "unavailable", code: "authentication_required" });
  });
});
