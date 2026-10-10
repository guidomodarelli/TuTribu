/** Exercises private management SSR through real application authorization, projection and input guards. @module personal-invitation-management-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetPersonalInvitationManagementPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-personal-invitation-management-page-use-case";
import { GetAdmissionPolicyUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-use-case";
import { ManagePersonalInvitationsUseCases } from "@/src/modules/academy-admissions/application/use-cases/manage-personal-invitations-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import { loadPersonalInvitationManagementPageState } from "@/src/modules/academy-admissions/infrastructure/composition/personal-invitation-management-page";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createPersonalInvitation } from "@/src/modules/academy-admissions/domain/entities/personal-invitation";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { PersonalInvitationReader, PersonalInvitationCommandWriter } from "@/src/modules/academy-admissions/domain/repositories/personal-invitation-management";
import type { AdmissionPolicyState } from "@/src/modules/academy-admissions/domain/repositories/admission-policy-management";

/** @returns Actual read-only use cases with controlled doubles only at own identity/storage ports. */
function fixture() {
  const now = new Date("2026-10-09T10:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-10T10:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async () => account) }, actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase(accounts, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const invitation = createPersonalInvitation({ id: randomUUID(), tribeId, actorUserId: userId, contact: { type: "email", value: "recipient@example.test" }, internalName: "Grupo inicial", requiresAllowlist: true, allowlistExemptionAcknowledged: false, now, policy: { contactType: "email", requiresAdditionalVerification: false } });
  const reader: PersonalInvitationReader = { list: vi.fn(async () => ({ invitations: [invitation], nextCursor: null })), read: vi.fn(async () => invitation) }, writer: PersonalInvitationCommandWriter = { create: vi.fn(), rename: vi.fn(), revoke: vi.fn() };
  const current: AdmissionPolicyState = { policy: createDefaultAdmissionPolicy({ id: tribeId, tribeId }), controlActivated: false, usage: null };
  const policyReader = { read: vi.fn(async () => current) }, policy = new GetAdmissionPolicyUseCase(resolver, policyReader, { read: async () => ({ pendingRequestCount: 0, preparation: null }) });
  const availability = { hasUsableAllowlist: vi.fn(async () => true) }, invitations = new ManagePersonalInvitationsUseCases(resolver, reader, writer);
  const resolveTribe = new ResolveAdmissionTribeUseCase({ readIdentity: async () => ({ id: tribeId, slug: "synthetic-academy" }) });
  const page = new GetPersonalInvitationManagementPageUseCase(accounts, { invitations, policy, resolveTribe, resolveContext: resolver, availability }, () => now);
  return { now, tribeId, account, accounts, actor, current, reader, writer, invitation, invitations, availability, page, input: { params: { slug: "synthetic-academy" }, query: {} } };
}

describe("personal invitation management SSR", () => {
  it("should reject an intermediate native account before reading contacts even when the initial account returns afterward", async () => {
    const data = fixture(), otherAccount = { ...data.account, userId: randomUUID(), session: { ...data.account.session, id: randomUUID() } };
    const originalList = data.invitations.list.bind(data.invitations);
    vi.spyOn(data.invitations, "list").mockImplementation(async (...queryArguments) => {
      data.accounts.getAuthenticatedAccount.mockResolvedValue(otherAccount);
      data.actor.userId = otherAccount.userId;
      try { return await originalList(...queryArguments); }
      finally { data.accounts.getAuthenticatedAccount.mockResolvedValue(data.account); data.actor.userId = data.account.userId; }
    });
    const state = await loadPersonalInvitationManagementPageState(data.input, async () => data.page);
    expect(state).toMatchObject({ kind: "unavailable", code: "authentication_required" });
    expect(data.reader.list).not.toHaveBeenCalled();
    expect(state).not.toHaveProperty("page");
  });
  it("should project exact-type list availability and private lifecycle dates without mutation recency or secret material", async () => {
    const data = fixture(), cursor = "2026-10-09T09:00:00.123456Z~" + randomUUID();
    const state = await loadPersonalInvitationManagementPageState({ ...data.input, query: { limit: "20", status: "active", cursor } }, async () => data.page);
    expect(state).toMatchObject({ kind: "ready", viewerId: data.account.userId, contactType: "email", requiresAdditionalVerification: false, hasUsableAllowlist: true, query: { limit: 20, status: "active", cursor }, page: { items: [{ id: data.invitation.id, version: 1, createdAt: data.now.toISOString(), redeemedAt: null, revokedAt: null, authorizationRevokedAt: null }] } });
    expect(data.availability.hasUsableAllowlist).toHaveBeenCalledWith(expect.objectContaining({ userId: data.account.userId, role: "leader" }), "email");
    expect(data.reader.list).toHaveBeenCalledOnce();
    for (const method of [data.writer.create, data.writer.rename, data.writer.revoke]) expect(method).not.toHaveBeenCalled();
    for (const field of ["session", "normalizedEmail", "initialToken", "invitationUrl", "keyrings", "tokenHash"]) expect(state).not.toHaveProperty(field);
  });

  it("should distinguish list absence and phone policy without inventing an enabled code or list", async () => {
    const data = fixture();
    data.current.policy = { ...data.current.policy!, contactType: "phone", requiresAdditionalVerification: true };
    data.current.usage = { tribeId: data.tribeId, version: 2, allowedCountries: ["AR"], platformRestrictions: [] };
    data.availability.hasUsableAllowlist.mockResolvedValue(false);
    const state = await loadPersonalInvitationManagementPageState(data.input, async () => data.page);
    expect(state).toMatchObject({ kind: "ready", contactType: "phone", requiresAdditionalVerification: true, allowedCountries: ["AR"], hasUsableAllowlist: false });
    expect(data.availability.hasUsableAllowlist).toHaveBeenCalledWith(expect.any(Object), "phone");
    data.current.policy = null;
    expect(await loadPersonalInvitationManagementPageState(data.input, async () => data.page)).toMatchObject({ kind: "ready", contactType: null, requiresAdditionalVerification: false, hasUsableAllowlist: false });
  });

  it("should close a guardian before history or availability reads and discard a changed session", async () => {
    const data = fixture(); data.actor.role = "guardian";
    expect(await loadPersonalInvitationManagementPageState(data.input, async () => data.page)).toMatchObject({ kind: "unavailable", code: "permission_denied" });
    expect(data.reader.list).not.toHaveBeenCalled(); expect(data.availability.hasUsableAllowlist).not.toHaveBeenCalled();
    data.actor.role = "leader";
    data.availability.hasUsableAllowlist.mockImplementation(async () => { data.account.session.id = randomUUID(); return true; });
    const initialSession = data.account.session.id;
    const initialAccount = { ...data.account, session: { ...data.account.session } };
    data.accounts.getAuthenticatedAccount.mockImplementation(async () => data.account.session.id === initialSession ? initialAccount : data.account);
    const state = await loadPersonalInvitationManagementPageState(data.input, async () => data.page);
    expect(state).toMatchObject({ kind: "unavailable", code: "authentication_required" }); expect(state).not.toHaveProperty("page");
    expect(data.reader.list).not.toHaveBeenCalled();
  });

  it.each([{ role: "leader" }, { limit: "0" }, { cursor: "invalid" }, { status: "unknown" }])("should reject supplied authority or unusable filters %j before server composition", async (query) => {
    const data = fixture(), open = vi.fn(async () => data.page);
    expect(await loadPersonalInvitationManagementPageState({ ...data.input, query }, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(open).not.toHaveBeenCalled();
  });

  it("should contain persistence failure without exposing partial contacts or its diagnostic cause", async () => {
    const data = fixture(); vi.mocked(data.reader.list).mockRejectedValue(new Error("Private database diagnostic"));
    const state = await loadPersonalInvitationManagementPageState(data.input, async () => data.page);
    expect(state).toMatchObject({ kind: "unavailable", code: "unexpected_failure" });
    expect(state).not.toHaveProperty("page"); expect(JSON.stringify(state)).not.toContain("Private database");
  });

  it("should expose redeemed authorization withdrawal as metadata without identifying the applicant or recycling the link", async () => {
    const data = fixture(), redeemedAt = new Date("2026-10-09T10:01:00Z"), withdrawal = new Date("2026-10-09T10:02:00Z");
    vi.mocked(data.reader.list).mockResolvedValue({ invitations: [{ ...data.invitation, status: "redeemed", version: 3, redeemedAt, authorizationRevokedAt: withdrawal, redeemedByUserId: randomUUID(), redeemedRequestId: randomUUID(), updatedAt: withdrawal }], nextCursor: null });
    const state = await loadPersonalInvitationManagementPageState(data.input, async () => data.page);
    expect(state).toMatchObject({ kind: "ready", page: { items: [{ status: "redeemed", version: 3, redeemedAt: redeemedAt.toISOString(), authorizationRevokedAt: withdrawal.toISOString() }] } });
    if (state.kind !== "ready") throw new Error("Expected authorized management metadata");
    for (const field of ["redeemedByUserId", "redeemedRequestId", "createdByUserId", "token"]) expect(state.page.items[0]).not.toHaveProperty(field);
  });
});
