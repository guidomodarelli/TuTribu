/** Exercises safe current leader SSR policy state and its actual inbound boundary. @module admission-policy-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionPolicyPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-page-use-case";
import { GetAdmissionPolicyUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-use-case";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import { loadAdmissionPolicyPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-policy-page";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";

/** Uses real application authorization and DTO mapping; only own account/storage ports are replaced. */
function fixture() {
  const now = new Date("2026-10-07T09:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "synthetic-leader@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-08T09:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async () => account) }, actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const reader = { read: vi.fn(async () => ({ policy: null, controlActivated: false, usage: null })) };
  const policy = new GetAdmissionPolicyUseCase(resolver, reader, { read: async () => ({ pendingRequestCount: 2, preparation: null }) });
  const resolveTribe = new ResolveAdmissionTribeUseCase({ readIdentity: async () => ({ id: tribeId, slug: "synthetic-academy" }) });
  const useCase = new GetAdmissionPolicyPageUseCase(accounts, { policy, resolveTribe }, () => now);
  return { now, tribeId, account, accounts, actor, reader, useCase, input: { params: { slug: "synthetic-academy" }, query: {} } };
}

describe("policy SSR page", () => {
  it("should render current authorized absence and impact without creating a policy or exposing native session identity", async () => {
    const data = fixture(), state = await loadAdmissionPolicyPageState(data.input, async () => data.useCase);
    expect(state).toMatchObject({ kind: "ready", slug: "synthetic-academy", tribeId: data.tribeId, viewerId: data.account.userId, renderedAt: data.now.toISOString(), policy: { state: "not_configured", policy: null, impact: { pendingRequestCount: 2 } } });
    expect(state).not.toHaveProperty("session");
    expect(state).not.toHaveProperty("normalizedEmail");
    expect(state).not.toHaveProperty("googleAccount");
  });

  it("should reject a guardian or a changed global session without returning private partial state", async () => {
    const data = fixture(); data.actor.role = "guardian";
    expect(await loadAdmissionPolicyPageState(data.input, async () => data.useCase)).toMatchObject({ kind: "unavailable", code: "permission_denied" });
    expect(data.reader.read).not.toHaveBeenCalled();
    data.actor.role = "leader";
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce({ ...data.account, session: { ...data.account.session, id: randomUUID() } });
    expect(await loadAdmissionPolicyPageState(data.input, async () => data.useCase)).toMatchObject({ kind: "unavailable", code: "authentication_required" });
  });

  it("should validate runtime params and query before composition and reject browser authority", async () => {
    const data = fixture(), open = vi.fn(async () => data.useCase);
    expect(await loadAdmissionPolicyPageState({ ...data.input, query: { role: "leader", prepared: "true" } }, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(await loadAdmissionPolicyPageState({ ...data.input, params: { slug: "../foreign" } }, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(open).not.toHaveBeenCalled();
  });

  it("should contain native composition failure in safe Spanish state without exposing provider diagnostics", async () => {
    const data = fixture();
    const state = await loadAdmissionPolicyPageState(data.input, async () => { throw new Error("Synthetic private database diagnostic"); });
    expect(state).toMatchObject({ kind: "unavailable", code: "unexpected_failure" });
    expect(state).not.toHaveProperty("policy");
    expect(JSON.stringify(state)).not.toContain("Synthetic private");
  });
});
