/** Exercises current leader SSR filters through actual authorization and own public projection. @module allowlist-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAllowlistPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-allowlist-page-use-case";
import { GetAdmissionPolicyUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-use-case";
import { ManageAllowlistUseCases } from "@/src/modules/academy-admissions/application/use-cases/manage-allowlist-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import { loadAllowlistPageState } from "@/src/modules/academy-admissions/infrastructure/composition/allowlist-page";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AllowlistCommandWriter, AllowlistReader } from "@/src/modules/academy-admissions/domain/repositories/allowlist-management";

/** @returns Real application readers with doubles confined to own account/persistence ports. */
function fixture() {
  const now = new Date("2026-10-09T08:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-10T08:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async () => account) }, actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const reader: AllowlistReader = { list: vi.fn(async () => ({ entries: [], nextCursor: null })), read: vi.fn(async () => null) };
  const writer: AllowlistCommandWriter = { create: vi.fn(), update: vi.fn() };
  const policyReader = { read: vi.fn(async () => ({ policy: null, controlActivated: false, usage: null })) };
  const policy = new GetAdmissionPolicyUseCase(resolver, policyReader, { read: async () => ({ pendingRequestCount: 0, preparation: null }) });
  const resolveTribe = new ResolveAdmissionTribeUseCase({ readIdentity: async () => ({ id: tribeId, slug: "synthetic-academy" }) });
  const useCase = new GetAllowlistPageUseCase(accounts, { allowlist: new ManageAllowlistUseCases(resolver, reader, writer), policy, resolveTribe }, () => now);
  return { now, tribeId, account, accounts, actor, reader, writer, policyReader, useCase, input: { params: { slug: "synthetic-academy" }, query: {} } };
}

describe("allowlist SSR page", () => {
  it("should project one filtered current leader page without policy creation, recency demand or native session data", async () => {
    const data = fixture(), cursorId = randomUUID(), cursor = `2026-10-09T07:00:00.123456Z~${cursorId}`;
    const state = await loadAllowlistPageState({ ...data.input, query: { limit: "20", search: "Grupo", status: "disabled", cursor } }, async () => data.useCase);
    expect(state).toMatchObject({ kind: "ready", viewerId: data.account.userId, contactType: null, page: { items: [], nextCursor: null }, query: { limit: 20, search: "Grupo", status: "disabled", cursor } });
    expect(data.reader.list).toHaveBeenCalledOnce();
    expect(data.reader.list).toHaveBeenCalledWith(expect.objectContaining({ role: "leader", tribeId: data.tribeId }), { limit: 20, search: "Grupo", status: "disabled", cursor: { createdAt: "2026-10-09T07:00:00.123456Z", id: cursorId } });
    expect(data.writer.create).not.toHaveBeenCalled(); expect(data.writer.update).not.toHaveBeenCalled();
    expect(state).not.toHaveProperty("session"); expect(state).not.toHaveProperty("normalizedEmail");
  });

  it("should close a guardian or changed native session without exposing the partial list", async () => {
    const data = fixture(); data.actor.role = "guardian";
    expect(await loadAllowlistPageState(data.input, async () => data.useCase)).toMatchObject({ kind: "unavailable", code: "permission_denied" });
    expect(data.reader.list).not.toHaveBeenCalled();
    data.actor.role = "leader";
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce({ ...data.account, session: { ...data.account.session, id: randomUUID() } });
    const state = await loadAllowlistPageState(data.input, async () => data.useCase);
    expect(state).toMatchObject({ kind: "unavailable", code: "authentication_required" }); expect(state).not.toHaveProperty("page");
  });

  it("should reject supplied authority and invalid pagination before server composition", async () => {
    const data = fixture(), open = vi.fn(async () => data.useCase);
    for (const query of [{ actor: "leader" }, { limit: "0" }, { cursor: "foreign" }]) expect(await loadAllowlistPageState({ ...data.input, query }, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(open).not.toHaveBeenCalled();
  });

  it("should contain a storage failure without returning diagnostics or partial private props", async () => {
    const data = fixture(); vi.mocked(data.reader.list).mockRejectedValue(new Error("Private PostgreSQL detail"));
    const state = await loadAllowlistPageState(data.input, async () => data.useCase);
    expect(state).toMatchObject({ kind: "unavailable", code: "unexpected_failure" });
    expect(state).not.toHaveProperty("page"); expect(JSON.stringify(state)).not.toContain("Private PostgreSQL");
  });
});
