/** @vitest-environment node */
/** Exercises manual admission rules without a messaging port or fabricated provider authority. @module manual-admission-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAcademyAdmissionFixtures } from "@/tests/support/academy-admission-fixtures";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { evaluateAdmissionSubmission, evaluatePendingAdmissionReview, canPerformAdmissionAction, type AdmissionSubmissionFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { createPendingAdmissionRequest, proposeAdmissionCancellation, getAdmissionRetryAllowedAt } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { proposeAdmissionDecision } from "@/src/modules/academy-admissions/domain/entities/admission-decision";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { SubmitAdmissionUseCase } from "@/src/modules/academy-admissions/application/use-cases/submit-admission-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionCommandWriter, AdmissionCommittedOutcome } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Creates current manual/OFF facts with no connection, key, sender or local proof. */
function manualFacts(): AdmissionSubmissionFacts {
  const fixture = createAcademyAdmissionFixtures("manual-admission");
  return {
    now: fixture.clock.now(), tribe: { id: fixture.tribes.academyA.id, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false },
    account: { userId: fixture.accounts.applicantA.userId, normalizedEmail: fixture.accounts.applicantA.email, googleAccount: null },
    policy: { ...createDefaultAdmissionPolicy({ id: randomUUID(), tribeId: fixture.tribes.academyA.id }), isOpen: true, activatedAt: fixture.clock.now() },
    source: { kind: "common" }, contact: { type: "email", value: fixture.accounts.applicantA.email },
    baseEvidence: null, localProof: null, currentConnection: null, membership: null,
    allowlistEntry: { tribeId: fixture.tribes.academyA.id, contact: { type: "email", value: fixture.accounts.applicantA.email }, enabled: true, boundUserId: null },
    contactBinding: null,
  };
}

/** Proposes an uncommitted pending request from current own facts. */
function pending(facts = manualFacts()) {
  if (!facts.account || !facts.policy) throw new Error("Synthetic manual facts are incomplete");
  return createPendingAdmissionRequest({ id: randomUUID(), tribeId: facts.tribe.id, userId: facts.account.userId, source: "common", contact: facts.contact, evidence: { kind: "declared" }, policy: facts.policy, message: null, now: facts.now });
}

describe("manual admission lifecycle", () => {
  it("should permit common manual OFF without Google contact evidence, sender, connection or an API key", () => {
    expect(evaluateAdmissionSubmission(manualFacts())).toEqual({ outcome: "pending", evidenceKind: "declared", bindContact: false, requiresExceptionReason: false });
  });

  it("should keep a matching declared contact unclaimed and create only a pending request with its original deadline", () => {
    const facts = manualFacts();
    const request = pending(facts);
    expect(request).toMatchObject({ status: "pending", version: 1, evidence: { kind: "declared" }, bindingId: null, proofId: null, decisionId: null });
    expect(request.expiresAt.getTime()).toBe(facts.now.getTime() + ADMISSION_LIMIT.pendingValidityMs);
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ bindContact: false });
  });

  it("should return an already legible muted membership before closed policy or a new contact can produce effects", () => {
    const facts = manualFacts();
    facts.policy = null;
    facts.membership = { tribeId: facts.tribe.id, userId: facts.account!.userId, role: "guardian", status: "muted", statusReason: "none", commercialRecoveryStatus: null };
    expect(evaluateAdmissionSubmission(facts)).toEqual({ outcome: "already_member", membershipEffect: "none" });
  });

  it.each(["leader", "guardian"] as const)("should propose only a basic approved effect for a current %s and keep its internal note separate", (role) => {
    const facts = manualFacts(), request = pending(facts), reviewer = { userId: randomUUID(), tribeId: facts.tribe.id, role, status: "active" as const };
    const review = { ...facts, request: { id: request.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null }, reviewer };
    expect(evaluatePendingAdmissionReview(review)).toMatchObject({ eligible: true });
    const proposal = proposeAdmissionDecision({ request, expectedVersion: 1, decisionId: randomUUID(), decision: "approve", actor: reviewer, review, internalReason: "Revisión manual", externalMessage: "Tu ingreso fue aprobado.", now: facts.now });
    expect(proposal).toMatchObject({ allowed: true, request: { status: "approved", version: 2 }, decision: { outcome: "approved", internalReason: "Revisión manual", externalMessage: "Tu ingreso fue aprobado.", evidenceSnapshot: { kind: "declared", referenceId: null, verifiedAt: null } }, membershipEffect: { role: "tribemate", status: "active" } });
    if (proposal.allowed) expect(proposal.membershipEffect).toEqual({ role: "tribemate", status: "active" });
  });

  it("should deny self approval and pending access to privileged grants without inventing membership", () => {
    const facts = manualFacts(), request = pending(facts), reviewer = { userId: request.userId, tribeId: facts.tribe.id, role: "leader" as const, status: "active" as const };
    expect(proposeAdmissionDecision({ request, expectedVersion: 1, decisionId: randomUUID(), decision: "approve", actor: reviewer, review: { ...facts, request: { id: request.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null }, reviewer }, internalReason: "Mi ingreso", externalMessage: null, now: facts.now })).toMatchObject({ allowed: false, code: "permission_denied" });
    expect(canPerformAdmissionAction({ userId: request.userId, tribeId: facts.tribe.id, role: null, status: null }, ADMISSION_ACTION.grantProductOrRole, { tribeId: facts.tribe.id })).toBe(false);
  });

  it("should reject an expired or stale decision while keeping the pending snapshot and deadline untouched", () => {
    const facts = manualFacts(), request = pending(facts), reviewer = { userId: randomUUID(), tribeId: facts.tribe.id, role: "guardian" as const, status: "active" as const };
    const input = { request, expectedVersion: 1, decisionId: randomUUID(), decision: "approve" as const, actor: reviewer, review: { ...facts, request: { id: request.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null }, reviewer }, internalReason: "Revisión", externalMessage: null, now: facts.now };
    expect(proposeAdmissionDecision({ ...input, expectedVersion: 2 })).toMatchObject({ allowed: false, code: "request_conflict" });
    expect(proposeAdmissionDecision({ ...input, now: request.expiresAt })).toMatchObject({ allowed: false, code: "admission_ineligible" });
    expect(request).toMatchObject({ status: "pending", version: 1, decisionId: null });
  });

  it("should deny current facts that substitute the contact or personal-source restrictions of the original request", () => {
    const facts = manualFacts(), request = pending(facts), actor = { userId: randomUUID(), tribeId: request.tribeId, role: "leader" as const, status: "active" as const };
    const review = { ...facts, request: { id: request.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null }, reviewer: actor };
    const input = { request, expectedVersion: 1, decisionId: randomUUID(), decision: "approve" as const, actor, review, internalReason: "Revisión", externalMessage: null, now: facts.now };
    const changedContact = { type: "email" as const, value: "changed@example.test" };
    expect(proposeAdmissionDecision({ ...input, review: { ...review, account: { ...facts.account!, normalizedEmail: changedContact.value }, contact: changedContact } })).toMatchObject({ allowed: false, code: "resource_unavailable" });
    const personal = { ...request, source: "personal" as const, invitationId: randomUUID(), requiresAllowlist: true };
    expect(proposeAdmissionDecision({ ...input, request: personal })).toMatchObject({ allowed: false, code: "resource_unavailable" });
  });

  it("should let the owner cancel independently of pause but deny another account", () => {
    const request = pending(), actor = { userId: request.userId, tribeId: request.tribeId, role: null, status: null };
    expect(proposeAdmissionCancellation({ request, expectedVersion: 1, decisionId: randomUUID(), actor, internalReason: null, now: request.submittedAt })).toMatchObject({ allowed: true, request: { status: "cancelled", version: 2, source: "common" } });
    expect(proposeAdmissionCancellation({ request, expectedVersion: 1, decisionId: randomUUID(), actor: { ...actor, userId: randomUUID() }, internalReason: null, now: request.submittedAt })).toMatchObject({ allowed: false, code: "permission_denied" });
  });

  it("should preserve the historical legacy reference when a coherent reviewer rejects its common-path request", () => {
    const facts = manualFacts(), request = { ...pending(facts), source: "legacy" as const, legacyInvitationId: randomUUID() };
    const actor = { userId: randomUUID(), tribeId: request.tribeId, role: "leader" as const, status: "active" as const };
    expect(proposeAdmissionDecision({ request, expectedVersion: 1, decisionId: randomUUID(), decision: "reject", actor, review: { ...facts, request: { id: request.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null }, reviewer: actor }, internalReason: "Revisión histórica", externalMessage: null, now: facts.now })).toMatchObject({ allowed: true, request: { source: "legacy", legacyInvitationId: request.legacyInvitationId, status: "rejected" }, membershipEffect: null });
  });

  it("should require the exact applied proof already referenced by the request instead of silently downgrading its evidence", () => {
    const facts = manualFacts(), original = pending(facts), proofId = randomUUID();
    const request = { ...original, proofId, evidence: { kind: "local" as const, proofId, verifiedAt: facts.now } };
    const actor = { userId: randomUUID(), tribeId: request.tribeId, role: "leader" as const, status: "active" as const };
    const review = { ...facts, request: { id: request.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null }, reviewer: actor };
    const input = { request, expectedVersion: 1, decisionId: randomUUID(), decision: "approve" as const, actor, review, internalReason: "Revisión", externalMessage: null, now: facts.now };
    expect(proposeAdmissionDecision(input)).toMatchObject({ allowed: false, code: "resource_unavailable" });
    const proof = { id: proofId, appliedRequestId: request.id, userId: request.userId, tribeId: request.tribeId, contact: request.contact!, purpose: "admission" as const, verificationEpoch: 1, connectionId: randomUUID(), connectionVersion: 1, securityEpoch: randomUUID(), status: "applied" as const, verifiedAt: facts.now, applyBefore: new Date(facts.now.getTime() + ADMISSION_LIMIT.verificationProofFreshnessMs) };
    expect(proposeAdmissionDecision({ ...input, review: { ...review, request: { ...review.request, attachedEvidence: { ...proof, id: randomUUID() } } } })).toMatchObject({ allowed: false, code: "resource_unavailable" });
    expect(proposeAdmissionDecision({ ...input, review: { ...review, request: { ...review.request, attachedEvidence: proof } } })).toMatchObject({ allowed: true });
  });

  it("should allow rejection without revalidating personal restrictions or an applied proof needed only for approval", () => {
    const facts = manualFacts(), original = pending(facts), actor = { userId: randomUUID(), tribeId: original.tribeId, role: "leader" as const, status: "active" as const };
    const review = { ...facts, request: { id: original.id, userId: original.userId, expiresAt: original.expiresAt, source: facts.source, attachedEvidence: null }, reviewer: actor };
    const input = { request: original, expectedVersion: 1, decisionId: randomUUID(), decision: "reject" as const, actor, review, internalReason: "Revisión sin autorización de ingreso", externalMessage: null, now: facts.now };
    expect(proposeAdmissionDecision({ ...input, request: { ...original, source: "personal", invitationId: randomUUID(), requiresAllowlist: true } })).toMatchObject({ allowed: true, request: { status: "rejected", source: "personal" }, membershipEffect: null });
    const proofId = randomUUID();
    expect(proposeAdmissionDecision({ ...input, request: { ...original, proofId, evidence: { kind: "local", proofId, verifiedAt: facts.now } } })).toMatchObject({ allowed: true, request: { status: "rejected", proofId }, membershipEffect: null });
  });

  it("should require a management reason and keep every terminal state immutable", () => {
    const request = pending(), actor = { userId: randomUUID(), tribeId: request.tribeId, role: "leader" as const, status: "active" as const };
    const input = { request, expectedVersion: 1, decisionId: randomUUID(), actor, internalReason: null, now: request.submittedAt };
    expect(proposeAdmissionCancellation(input)).toMatchObject({ allowed: false, code: "invalid_input" });
    const cancelled = proposeAdmissionCancellation({ ...input, internalReason: "Corrección solicitada" });
    if (!cancelled.allowed) throw new Error("Synthetic cancellation was not proposed");
    expect(proposeAdmissionCancellation({ ...input, request: cancelled.request, expectedVersion: 2, internalReason: "Nueva corrección" })).toMatchObject({ allowed: false, code: "request_conflict" });
  });

  it("should retain a one-day presentation cadence and seven days after rejection without granting an early retry", () => {
    const request = pending();
    expect(getAdmissionRetryAllowedAt(request)).toEqual(new Date(request.submittedAt.getTime() + ADMISSION_LIMIT.submissionCadenceMs));
    const rejectedAt = new Date(request.submittedAt.getTime() + ADMISSION_LIMIT.submissionCadenceMs);
    expect(getAdmissionRetryAllowedAt({ ...request, status: "rejected", resolvedAt: rejectedAt })).toEqual(new Date(rejectedAt.getTime() + ADMISSION_LIMIT.rejectionRetryWaitMs));
    expect(() => getAdmissionRetryAllowedAt({ ...request, status: "rejected", resolvedAt: null })).toThrowError(expect.objectContaining({ code: "resource_unavailable" }));
  });
});

describe("manual admission application", () => {
  /** Creates explicit own persistence ports, without simulating PostgreSQL or provider behavior. */
  function submissionPorts() {
    const facts = manualFacts(), operationId = randomUUID(), requestId = randomUUID();
    const account: AuthenticatedAccount = { userId: facts.account!.userId, normalizedEmail: facts.account!.normalizedEmail, session: { id: randomUUID(), expiresAt: new Date(facts.now.getTime() + ADMISSION_LIMIT.submissionCadenceMs) }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
    const outcome: AdmissionCommittedOutcome = { operationId, outcome: "pending", admissionRequestId: randomUUID(), committedRequestVersion: 1, membership: null };
    const submit = vi.fn<AdmissionCommandWriter["submit"]>().mockResolvedValue({ state: "completed", operationId, replayed: false, result: outcome });
    const writer: AdmissionCommandWriter = { submit, decide: vi.fn(), cancel: vi.fn() };
    const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
    const input = { tribeId: facts.tribe.id, requestId, operationId, expectedPolicyVersion: 1, confirmed: true as const };
    return { accounts, account, writer, submit, input, outcome, facts };
  }

  it("should derive email and identity from the current account and submit manual OFF through only its own writer", async () => {
    const fixture = submissionPorts();
    const useCase = new SubmitAdmissionUseCase(fixture.accounts, fixture.writer, () => fixture.facts.now);
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: true, value: { state: "completed", result: fixture.outcome } });
    expect(fixture.submit).toHaveBeenCalledWith({ ...fixture.input, userId: fixture.account.userId, sessionId: fixture.account.session.id, type: "submit_admission", source: { kind: "common" }, contact: { type: "email", value: fixture.account.normalizedEmail }, proofId: null, message: null });
    expect(fixture.writer.decide).not.toHaveBeenCalled();
    expect(fixture.writer.cancel).not.toHaveBeenCalled();
  });

  it("should preserve the original operation on repeated confirmation without making a new key or inventing membership", async () => {
    const fixture = submissionPorts(), useCase = new SubmitAdmissionUseCase(fixture.accounts, fixture.writer, () => fixture.facts.now);
    await useCase.execute(fixture.input);
    fixture.submit.mockResolvedValue({ state: "completed", operationId: fixture.input.operationId, replayed: true, result: fixture.outcome });
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: true, value: { replayed: true, result: { outcome: "pending", membership: null } } });
    expect(fixture.submit.mock.calls[0][0]).toEqual(fixture.submit.mock.calls[1][0]);
  });

  it("should deny an absent or expired session before reaching the writer", async () => {
    const fixture = submissionPorts(), useCase = new SubmitAdmissionUseCase(fixture.accounts, fixture.writer, () => fixture.facts.now);
    fixture.accounts.getAuthenticatedAccount.mockResolvedValueOnce(null);
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    fixture.account.session.expiresAt = fixture.facts.now;
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it("should reject an incoherent phone before persistence and keep known unresolved work attached to its original operation", async () => {
    const fixture = submissionPorts(), useCase = new SubmitAdmissionUseCase(fixture.accounts, fixture.writer, () => fixture.facts.now);
    expect(await useCase.execute({ ...fixture.input, phone: "+14155552671", country: "AR" })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(fixture.submit).not.toHaveBeenCalled();
    fixture.submit.mockRejectedValueOnce(new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: fixture.input.operationId }));
    expect(await useCase.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId: fixture.input.operationId, state: "started" } } });
    fixture.submit.mockRejectedValueOnce(new Error("Synthetic private storage failure"));
    const failed = await useCase.execute(fixture.input);
    expect(failed).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
    if (!failed.ok) expect(failed.failure.operation).toBeUndefined();
  });
});
