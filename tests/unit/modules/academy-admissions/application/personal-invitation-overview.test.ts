/** @vitest-environment node */
/** Exercises the actual personal projection guard and native account liveness with doubles only of own read ports. @module personal-invitation-overview-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetPersonalInvitationOverviewUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-personal-invitation-overview-use-case";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { PersonalInvitationOverviewFacts } from "@/src/modules/academy-admissions/domain/repositories/personal-invitation-overview-reader";
import { personalInvitationOverviewSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-overview-schemas";

/** @returns Exact private personal facts without any write/issuer or provider dependency. */
function fixture() {
  const now = new Date("2026-10-09T12:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), subject = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "recipient+tag@gmail.com", session: { id: randomUUID(), expiresAt: new Date("2026-10-10T12:00:00Z") }, googleAccount: { id: accountId, subject }, identityEvidence: null, recentAuthentication: [] };
  const contact = { type: "email" as const, value: account.normalizedEmail };
  const policy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), mode: "allowlist" as const, isOpen: true, activatedAt: now };
  const tribe = { id: tribeId, slug: "synthetic-personal", name: "Academia sintética", accessModel: "academy" as const, controlActivated: true, evaluatorEnabled: true };
  const facts: PersonalInvitationOverviewFacts = { tokenAvailable: true, recipientMatchesAccount: true, redeemedByUserId: null, redeemedRequestId: null, overview: { tribe, policy, membership: null, request: null, recoveryLocked: false }, eligibility: { now, tribe: { id: tribeId, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false }, policy, account: { userId, normalizedEmail: contact.value, googleAccount: { id: accountId, subject } }, source: { kind: "personal", invitation: { tribeId, contact, status: "active", requiresAllowlist: false, authorizationRevoked: false, expiresAt: new Date("2026-10-16T12:00:00Z") } }, contact, baseEvidence: { userId, accountId, subject, normalizedEmail: contact.value, authority: "gmail", invalidated: false }, localProof: null, currentConnection: null, membership: null, allowlistEntry: null, contactBinding: null } };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const reader = { readOverview: vi.fn(async (): Promise<PersonalInvitationOverviewFacts | null> => facts) };
  return { now, account, accounts, reader, facts, query: { token: "opaque-personal-proposal", requestId: randomUUID() }, useCase: new GetPersonalInvitationOverviewUseCase(accounts, reader, () => now) };
}

describe("personal invitation read-only overview", () => {
  it("should close an own preview whose public policy conflicts with the internal policy used to predict the result", async () => {
    const data = fixture();
    data.facts.overview.policy = { ...data.facts.overview.policy!, mode: "manual_review", version: 3 };
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
  it("should hide a phone already bound to another account even when a stale matching own proof still exists", async () => {
    const data = fixture(), contact = { type: "phone" as const, value: "+5491155501234", country: "AR" };
    data.facts.eligibility.policy!.contactType = "phone"; data.facts.eligibility.policy!.requiresAdditionalVerification = true;
    data.facts.overview.policy!.contactType = "phone"; data.facts.overview.policy!.requiresAdditionalVerification = true;
    data.facts.overview.verification = { channel: "sms", allowedCountries: ["AR"] };
    data.facts.eligibility.contact = contact;
    if (data.facts.eligibility.source.kind !== "personal") throw new Error("Expected personal fixture source");
    data.facts.eligibility.source.invitation.contact = contact;
    data.facts.eligibility.contactBinding = { ownerUserId: randomUUID(), contact };
    const connection = { id: randomUUID(), version: 1, securityEpoch: "synthetic-phone-epoch" };
    data.facts.eligibility.currentConnection = connection;
    data.facts.eligibility.localProof = { id: randomUUID(), userId: data.account.userId, tribeId: data.facts.overview.tribe.id, contact, purpose: "admission", verificationEpoch: 1, connectionId: connection.id, connectionVersion: 1, securityEpoch: connection.securityEpoch, status: "available", verifiedAt: new Date("2026-10-09T11:00:00Z"), applyBefore: new Date("2026-10-09T11:15:00Z"), appliedRequestId: null };
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { state: "unavailable" } });
  });
  it("should preserve the exact owned redeemed pending after link expiry without treating another account or request lineage as authorization", async () => {
    const data = fixture(), requestId = randomUUID();
    data.facts.overview.request = { id: requestId, status: "pending", version: 2, submittedAt: data.now.toISOString(), expiresAt: "2026-11-08T12:00:00Z", source: "personal", needsVerification: false, eligibilityReasons: [] };
    if (data.facts.eligibility.source.kind !== "personal") throw new Error("Expected personal fixture source");
    data.facts.eligibility.source.invitation.status = "redeemed";
    data.facts.eligibility.source.invitation.expiresAt = new Date("2026-10-08T12:00:00Z");
    data.facts.tokenAvailable = false; data.facts.redeemedByUserId = data.account.userId; data.facts.redeemedRequestId = requestId;
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { overview: { state: "pending", request: { id: requestId, version: 2 } } } });
    data.account.normalizedEmail = "renamed.account@example.test";
    data.facts.recipientMatchesAccount = false;
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { overview: { state: "pending", request: { id: requestId } } } });
    data.facts.redeemedByUserId = randomUUID();
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { state: "unavailable" } });
    data.facts.redeemedByUserId = data.account.userId; data.facts.redeemedRequestId = randomUUID();
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { state: "unavailable" } });
  });
  it("should prioritize an existing own pending before a new active link and hide a revoked link even if another pending exists", async () => {
    const data = fixture();
    data.facts.overview.request = { id: randomUUID(), status: "pending", version: 1, submittedAt: data.now.toISOString(), expiresAt: "2026-11-08T12:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [] };
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { overview: { state: "pending", nextAction: "view_request" } } });
    if (data.facts.eligibility.source.kind !== "personal") throw new Error("Expected personal fixture source");
    data.facts.eligibility.source.invitation.status = "revoked"; data.facts.tokenAvailable = false;
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { state: "unavailable" } });
  });
  it("should ask anonymous visitors to sign in without reading the token or returning any tribe or recipient hint", async () => {
    const data = fixture(); data.accounts.getAuthenticatedAccount.mockResolvedValue(null);
    expect(await data.useCase.execute(data.query)).toEqual({ ok: true, value: { state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." } });
    expect(data.reader.readOverview).not.toHaveBeenCalled();
  });
  it("should project only authorized current state and the expected personal outcome without raw recipient, token or invitation metadata", async () => {
    const data = fixture(), result = await data.useCase.execute(data.query);
    expect(result).toMatchObject({ ok: true, value: { state: "available", requiresAllowlist: false, expectedOutcome: "admitted", overview: { state: "available", nextAction: "request_admission" } } });
    expect(JSON.stringify(result)).not.toContain(data.account.normalizedEmail); expect(JSON.stringify(result)).not.toContain(data.query.token);
    data.facts.eligibility.policy!.mode = "manual_review"; data.facts.overview.policy!.mode = "manual_review";
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { expectedOutcome: "pending" } });
  });
  it("should return the same generic unavailable view for a wrong account, absent token, unproven OFF identity or closed token", async () => {
    const data = fixture();
    data.facts.recipientMatchesAccount = false; const wrong = await data.useCase.execute(data.query);
    data.reader.readOverview.mockResolvedValue(null); expect(await data.useCase.execute(data.query)).toEqual(wrong);
    data.reader.readOverview.mockResolvedValue(data.facts); data.facts.recipientMatchesAccount = true; data.facts.eligibility.baseEvidence = null;
    expect(await data.useCase.execute(data.query)).toEqual(wrong);
    data.facts.tokenAvailable = false; expect(await data.useCase.execute(data.query)).toEqual(wrong);
    expect(wrong).toMatchObject({ ok: true, value: { state: "unavailable" } });
  });
  it("should require real local verification ON without granting immediate access from the base capture", async () => {
    const data = fixture(); data.facts.eligibility.policy!.requiresAdditionalVerification = true; data.facts.overview.policy!.requiresAdditionalVerification = true;
    data.facts.overview.verification = { channel: "email", allowedCountries: [] };
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { overview: { state: "verification_required", nextAction: "verify_contact", verification: { channel: "email" } } } });
  });
  it("should reject session changes after awaited private reads and foreign scoped facts", async () => {
    const data = fixture();
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce({ ...data.account, session: { ...data.account.session, id: randomUUID() } });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    data.facts.eligibility.tribe.id = randomUUID();
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
  it("should close extra private hints in generic and available public states using the real DTO schema", () => {
    expect(personalInvitationOverviewSchema.safeParse({ state: "unavailable", safeMessage: "No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso.", recipient: "private@example.test" }).success).toBe(false);
    expect(personalInvitationOverviewSchema.safeParse({ state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal.", token: "private-material" }).success).toBe(false);
  });
});
