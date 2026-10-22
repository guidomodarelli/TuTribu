/** @vitest-environment node */
/** Exercises public/own overview decisions without writes or messaging dependencies. @module admission-overview-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionOverviewUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-overview-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionOverviewFacts } from "@/src/modules/academy-admissions/domain/repositories/admission-query-reader";
import type { AdmissionSubmissionFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";

/** Supplies only feature-owned facts and a current account port. */
function overviewFixture() {
  const now = new Date("2026-10-06T12:00:00Z"), tribeId = randomUUID();
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "applicant@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-07T12:00:00Z") }, googleAccount: null, identityEvidence: null};
  const facts: AdmissionOverviewFacts<AdmissionRequestDto> = { tribe: { id: tribeId, slug: "synthetic-academy", name: "Academia sintética", accessModel: "academy", controlActivated: true, evaluatorEnabled: true }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, isOpen: true, version: 1 }, membership: null, request: null, recoveryLocked: false };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const reader = { readOverview: vi.fn(async (): Promise<AdmissionOverviewFacts | null> => facts) };
  return { accounts, account, reader, facts, now, query: { slug: facts.tribe.slug, requestId: randomUUID() } };
}

/** @returns Own facts for an email list with code OFF and no exceptions, whose Google evidence matches an enabled entry. */
function allowlistEligibility(fixture: ReturnType<typeof overviewFixture>): AdmissionSubmissionFacts {
  const { tribe } = fixture.facts, { userId, normalizedEmail } = fixture.account, contact = { type: "email" as const, value: normalizedEmail }, accountId = randomUUID(), subject = randomUUID();
  const policy = { ...createDefaultAdmissionPolicy({ id: tribe.id, tribeId: tribe.id }), mode: "allowlist" as const, isOpen: true, allowCommonExceptions: false, activatedAt: new Date("2026-10-06T11:00:00Z") };
  return { now: fixture.now, tribe: { id: tribe.id, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false }, account: { userId, normalizedEmail, googleAccount: { id: accountId, subject } }, policy, source: { kind: "common" }, contact,
    baseEvidence: { userId, accountId, subject, normalizedEmail, authority: "gmail", invalidated: false }, localProof: null, currentConnection: null, membership: null, contactBinding: null, allowlistEntry: { tribeId: tribe.id, contact, enabled: true, boundUserId: null } };
}

describe("admission overview", () => {
  it("should explain the current pending restriction while keeping the original request navigation", async () => {
    const fixture = overviewFixture();
    const request = { id: randomUUID(), status: "pending" as const, version: 2, submittedAt: fixture.now.toISOString(), expiresAt: "2026-11-05T12:00:00Z", source: "common" as const, needsVerification: false, eligibilityReasons: ["admission_closed" as const] };
    fixture.facts.request = request;
    fixture.facts.policy!.isOpen = false;
    const useCase = new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "pending", nextAction: "view_request", request, safeMessage: "Por ahora esta solicitud no puede aprobarse porque las admisiones no están disponibles. Su plazo sigue corriendo." } });
  });

  it("should allowlist verification channel and countries for the native applicant without sender or quota references", async () => {
    const fixture = overviewFixture();
    fixture.facts.policy!.contactType = "phone";
    fixture.facts.policy!.requiresAdditionalVerification = true;
    const verification = { channel: "whatsapp" as const, allowedCountries: ["AR"], allowedAlternative: "sms" as const, secretRef: randomUUID(), quota: 20 };
    fixture.reader.readOverview.mockResolvedValue({ ...fixture.facts, verification });
    const result = await new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query);
    expect(result).toMatchObject({ ok: true, value: { state: "verification_required", verification: { channel: "whatsapp", allowedCountries: ["AR"], allowedAlternative: "sms" } } });
    if (result.ok) { expect(result.value).not.toHaveProperty("verification.secretRef"); expect(result.value).not.toHaveProperty("verification.quota"); }
  });

  it("should hide applicant-only choices from anonymous and OFF reads and reject a mismatched own channel", async () => {
    const fixture = overviewFixture(), verification = { channel: "whatsapp" as const, allowedCountries: ["AR"] };
    fixture.facts.policy!.requiresAdditionalVerification = true;
    fixture.facts.policy!.contactType = "phone";
    fixture.reader.readOverview.mockResolvedValue({ ...fixture.facts, verification });
    const useCase = new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    fixture.accounts.getAuthenticatedAccount.mockResolvedValue(null);
    const anonymous = await useCase.execute(fixture.query);
    expect(anonymous.ok).toBe(true);
    if (anonymous.ok) expect(anonymous.value).not.toHaveProperty("verification");
    fixture.accounts.getAuthenticatedAccount.mockResolvedValue(fixture.account);
    fixture.facts.policy!.requiresAdditionalVerification = false;
    const off = await useCase.execute(fixture.query);
    expect(off.ok).toBe(true);
    if (off.ok) expect(off.value).not.toHaveProperty("verification");
    fixture.facts.policy!.requiresAdditionalVerification = true;
    fixture.reader.readOverview.mockResolvedValue({ ...fixture.facts, verification: { channel: "email", allowedCountries: [] } });
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
  it("should expose only public setup to an anonymous account without a key, sender or prior membership", async () => {
    const fixture = overviewFixture();
    fixture.accounts.getAuthenticatedAccount.mockResolvedValue(null);
    const result = await new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query);
    expect(result).toMatchObject({ ok: true, value: { state: "sign_in_required", nextAction: "sign_in", tribe: { slug: fixture.query.slug }, policy: { version: 1 } } });
    expect(fixture.reader.readOverview).toHaveBeenCalledWith(fixture.query, null);
    if (result.ok) { expect(result.value.tribe).not.toHaveProperty("id"); expect(result.value).not.toHaveProperty("membership"); expect(result.value).not.toHaveProperty("request"); }
  });

  it("should keep a legible membership and an existing pending ahead of a paused policy", async () => {
    const fixture = overviewFixture(), useCase = new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    fixture.facts.policy!.isOpen = false;
    fixture.facts.membership = { role: "guardian", status: "muted", statusReason: "none", commercialRecoveryStatus: null };
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "already_member", nextAction: "open_academy" } });
    fixture.facts.membership = null;
    fixture.facts.request = { id: randomUUID(), status: "pending", version: 1, submittedAt: fixture.now.toISOString(), expiresAt: "2026-11-05T12:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [] };
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "pending", nextAction: "view_request", request: { id: fixture.facts.request.id } } });
  });

  it("should offer explicit manual presentation and block premature retries or missing activation without effects", async () => {
    const fixture = overviewFixture(), useCase = new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "available", nextAction: "request_admission" } });
    fixture.facts.request = { id: randomUUID(), status: "cancelled", version: 2, submittedAt: fixture.now.toISOString(), expiresAt: "2026-11-05T12:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], retryAllowedAt: "2026-10-07T12:00:00Z" };
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "closed", nextAction: "wait" } });
    fixture.facts.request = null;
    fixture.facts.tribe.controlActivated = false;
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "closed", nextAction: "contact_leader" } });
  });

  it("should keep ON verification explicit and reject a changed session or foreign facts instead of returning stale own data", async () => {
    const fixture = overviewFixture(), useCase = new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    fixture.facts.policy!.requiresAdditionalVerification = true;
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "verification_required", nextAction: "verify_contact" } });
    fixture.accounts.getAuthenticatedAccount.mockResolvedValueOnce(fixture.account).mockResolvedValueOnce({ ...fixture.account, session: { ...fixture.account.session, id: randomUUID() } });
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    fixture.facts.tribe.slug = "foreign-academy";
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
  });

  it("should offer a known commercial basic recovery and close conduct or unknown history using the membership owner's rule", async () => {
    const fixture = overviewFixture(), useCase = new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    fixture.facts.membership = { role: "tribemate", status: "removed", statusReason: "subscription_inactive", commercialRecoveryStatus: "muted" };
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "available", nextAction: "request_admission" } });
    fixture.facts.membership.commercialRecoveryStatus = null;
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "closed" } });
    fixture.facts.membership.statusReason = "conduct_blocked";
    fixture.facts.membership.status = "blocked";
    fixture.facts.membership.commercialRecoveryStatus = "active";
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "closed" } });
  });

  it("should replace the form with an account change when the own trusted email cannot meet a list without exceptions or another account holds it", async () => {
    const fixture = overviewFixture(), useCase = new GetAdmissionOverviewUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    fixture.facts.policy!.mode = "allowlist";
    const matching = allowlistEligibility(fixture);
    fixture.facts.allowlistEligibility = matching;
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "available", nextAction: "request_admission" } });
    const allowlistOnly = { ok: true, value: { state: "closed", nextAction: "change_account", safeMessage: "Esta academia solo admite correos habilitados por su equipo y no pudimos confirmar que el correo de esta cuenta lo esté. Ingresá con la cuenta de un correo habilitado o consultá al equipo de la academia." } };
    for (const facts of [{ ...matching, allowlistEntry: null }, { ...matching, allowlistEntry: { ...matching.allowlistEntry!, enabled: false } }, { ...matching, baseEvidence: null }, { ...matching, baseEvidence: { ...matching.baseEvidence!, authority: "insufficient" as const } }, { ...matching, contactBinding: { ownerUserId: randomUUID(), contact: matching.contact! } }]) {
      fixture.facts.allowlistEligibility = facts;
      const result = await useCase.execute(fixture.query);
      expect(result).toMatchObject(allowlistOnly);
      if (result.ok) expect(result.value).not.toHaveProperty("allowlistEligibility");
    }
    fixture.facts.request = { id: randomUUID(), status: "pending", version: 1, submittedAt: fixture.now.toISOString(), expiresAt: "2026-11-05T12:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [] };
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "pending", nextAction: "view_request" } });
  });
});
