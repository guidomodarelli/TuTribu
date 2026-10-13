/** @vitest-environment node */
/** Exercises real current-context resolution before individual admission mutations. @module admission-review-actions-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { DecideAdmissionRequestUseCase } from "@/src/modules/academy-admissions/application/use-cases/decide-admission-request-use-case";
import { CancelAdmissionRequestUseCase } from "@/src/modules/academy-admissions/application/use-cases/cancel-admission-request-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionCommandWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import type { AdmissionAuthorizationResource } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";

/** Supplies only own account/resource/persistence ports; the resolver remains real. */
function reviewActions(role: AdmissionActorFacts["role"] = "guardian") {
  const now = new Date("2026-10-06T12:00:00Z"), tribeId = randomUUID(), admissionRequestId = randomUUID(), applicantUserId = randomUUID(), operationId = randomUUID();
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "reviewer@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-07T12:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const actor: AdmissionActorFacts = { userId: account.userId, tribeId, role, status: "active" };
  const resource: AdmissionAuthorizationResource = { id: admissionRequestId, tribeId, applicantUserId };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => resource }, () => now);
  const decide = vi.fn<AdmissionCommandWriter["decide"]>().mockResolvedValue({ state: "completed", operationId, replayed: false, result: { admissionRequestId, version: 2, status: "approved" } });
  const cancel = vi.fn<AdmissionCommandWriter["cancel"]>().mockResolvedValue({ state: "completed", operationId, replayed: false, result: { admissionRequestId, version: 2, status: "cancelled" } });
  const writer: AdmissionCommandWriter = { submit: vi.fn(), decide, cancel };
  return { account, actor, resource, resolver, writer, decide, cancel, input: { tribeId, admissionRequestId, operationId, requestId: randomUUID(), expectedVersion: 1, confirmed: true as const } };
}

describe("individual admission review application", () => {
  it("should derive the actual guardian/session and preserve decision, internal reason and external message separately", async () => {
    const fixture = reviewActions(), useCase = new DecideAdmissionRequestUseCase(fixture.resolver, fixture.writer);
    const input = { ...fixture.input, decision: "approve" as const, internalReason: "Revisión manual", externalMessage: "Tu ingreso fue aprobado." };
    expect(await useCase.execute(input)).toMatchObject({ ok: true, value: { result: { status: "approved", version: 2 } } });
    expect(fixture.decide).toHaveBeenCalledWith({ ...input, userId: fixture.account.userId, sessionId: fixture.account.session.id, type: "decide_admission_request" });
  });

  it("should deny self approval and revoked reviewer role before invoking the writer", async () => {
    const fixture = reviewActions(), useCase = new DecideAdmissionRequestUseCase(fixture.resolver, fixture.writer);
    const input = { ...fixture.input, decision: "approve" as const, internalReason: "Revisión", externalMessage: null };
    fixture.resource.applicantUserId = fixture.account.userId;
    expect(await useCase.execute(input)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    fixture.resource.applicantUserId = randomUUID();
    fixture.actor.status = "muted";
    expect(await useCase.execute(input)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(fixture.decide).not.toHaveBeenCalled();
  });

  it("should permit own cancellation without membership but refuse management cancellation to a guardian", async () => {
    const fixture = reviewActions(null);
    fixture.actor.status = null;
    fixture.resource.applicantUserId = fixture.account.userId;
    expect(await new CancelAdmissionRequestUseCase(fixture.resolver, fixture.writer, ADMISSION_ACTION.cancelOwnRequest).execute(fixture.input)).toMatchObject({ ok: true, value: { result: { status: "cancelled" } } });
    expect(fixture.cancel).toHaveBeenCalledWith({ ...fixture.input, userId: fixture.account.userId, sessionId: fixture.account.session.id, type: "cancel_admission_request", internalReason: null });
    fixture.actor.role = "guardian";
    fixture.actor.status = "active";
    fixture.cancel.mockClear();
    expect(await new CancelAdmissionRequestUseCase(fixture.resolver, fixture.writer, ADMISSION_ACTION.cancelByManagement).execute({ ...fixture.input, internalReason: "Gestión" })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(fixture.cancel).not.toHaveBeenCalled();
  });
});
