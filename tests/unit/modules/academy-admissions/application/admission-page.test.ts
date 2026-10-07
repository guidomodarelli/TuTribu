/** @vitest-environment node */
/** Exercises the page use case and real input/DTO boundaries through own ports only. @module admission-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-page-use-case";
import { loadAdmissionPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-page";
import type { AdmissionOverviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Supplies explicit account/query ports without database or SDK replacement. */
function pageFixture() {
  const now = new Date("2026-10-07T01:00:00Z");
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "applicant@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-08T01:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const request = { id: randomUUID(), status: "pending" as const, version: 1, submittedAt: now.toISOString(), expiresAt: "2026-11-06T01:00:00Z", source: "common" as const, needsVerification: false, eligibilityReasons: [], contact: { type: "email" as const, maskedValue: "a•••@example.test", evidenceKind: "declared" as const } };
  const overview: AdmissionOverviewDto = { tribe: { slug: "synthetic-academy", name: "Academia sintética", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, isOpen: true, version: 1 }, state: "pending", nextAction: "view_request", safeMessage: "Tu solicitud está pendiente.", request };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const readers = { overview: { execute: vi.fn(async () => ({ ok: true as const, value: overview })) }, own: { getOwn: vi.fn(async () => ({ ok: true as const, value: request })) }, resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId: randomUUID() } })) } };
  return { account, accounts, request, overview, readers, now, useCase: new GetAdmissionPageUseCase(accounts, readers, () => now) };
}

describe("admission page state", () => {
  it("should return native viewer id and own public state without exporting session/provider or mutation ports", async () => {
    const fixture = pageFixture();
    const result = await fixture.useCase.execute({ slug: fixture.overview.tribe.slug, requestId: randomUUID() });
    expect(result).toMatchObject({ ok: true, value: { kind: "ready", viewerId: fixture.account.userId, request: { id: fixture.request.id }, renderedAt: fixture.now.toISOString() } });
    expect(JSON.stringify(result)).not.toContain(fixture.account.session.id);
    expect(JSON.stringify(result)).not.toContain(fixture.account.normalizedEmail);
    expect(fixture.readers.own.getOwn).not.toHaveBeenCalled();
  });

  it("should ask for the exact historical own request rather than substituting overview's newer request", async () => {
    const fixture = pageFixture(), historicalId = randomUUID(), correlation = randomUUID();
    fixture.readers.own.getOwn.mockResolvedValueOnce({ ok: true, value: { ...fixture.request, id: historicalId, status: "pending" } });
    const result = await fixture.useCase.execute({ slug: fixture.overview.tribe.slug, requestId: correlation, admissionRequestId: historicalId });
    expect(result).toMatchObject({ ok: true, value: { request: { id: historicalId }, overview: { request: { id: fixture.request.id } } } });
    expect(fixture.readers.own.getOwn).toHaveBeenCalledWith({ tribeId: expect.any(String), requestId: correlation, admissionRequestId: historicalId });
  });

  it("should reject a session change after readers without returning another account's snapshot", async () => {
    const fixture = pageFixture();
    fixture.accounts.getAuthenticatedAccount.mockResolvedValueOnce(fixture.account).mockResolvedValueOnce({ ...fixture.account, session: { ...fixture.account.session, id: randomUUID() } });
    expect(await fixture.useCase.execute({ slug: fixture.overview.tribe.slug, requestId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });

  it("should reject malformed input before composition and keep auth returns local without exposing causes", async () => {
    const open = vi.fn();
    expect(await loadAdmissionPageState({ params: { requestId: randomUUID() }, query: { tribe: "synthetic-academy", role: "leader" }, mode: "request" }, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(open).not.toHaveBeenCalled();
    const requestId = randomUUID();
    const state = await loadAdmissionPageState({ params: { requestId }, query: { tribe: "synthetic-academy" }, mode: "request" }, async () => ({ page: { execute: async () => ({ ok: false, failure: { code: ADMISSION_ERROR_CODE.authenticationRequired, cause: new Error("Synthetic private auth payload") } }) } }));
    expect(state).toEqual({ kind: "unavailable", code: "authentication_required", message: ADMISSION_ERROR_MESSAGE.authentication_required, returnPath: `/admissions/requests/${requestId}?tribe=synthetic-academy` });
    expect(JSON.stringify(state)).not.toContain("Synthetic private auth payload");
  });
});
