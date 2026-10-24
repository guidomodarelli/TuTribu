/** @vitest-environment node */
/** Exercises declared WhatsApp requirements without a provider or identity claim. @module admission-whatsapp-number-tests */
import { describe, expect, it } from "vitest";
import { createDefaultAdmissionPolicy, proposeAdmissionPolicyChange } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { evaluateAdmissionSubmission, evaluatePendingAdmissionEligibility, type AdmissionSubmissionFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { normalizeAdmissionWhatsappNumber, proposeAdmissionWhatsappNumberChange } from "@/src/modules/academy-admissions/domain/value-objects/admission-whatsapp-number";
import { createAcademyAdmissionFixtures } from "@/tests/support/academy-admission-fixtures";
import { projectAdmissionReview } from "@/src/modules/academy-admissions/application/results/admission-review-projection";

/** @returns Current manual/OFF facts with no channel, proof or membership authority. */
function whatsappFacts(): AdmissionSubmissionFacts {
  const fixtures = createAcademyAdmissionFixtures("declared-whatsapp");
  const user = fixtures.accounts.applicantA;
  return { now: fixtures.clock.now(), tribe: { id: fixtures.tribes.academyA.id, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false },
    account: { userId: user.userId, normalizedEmail: user.email, googleAccount: null },
    policy: { ...createDefaultAdmissionPolicy({ id: "policy", tribeId: fixtures.tribes.academyA.id }), requiresWhatsappNumber: false, isOpen: true, activatedAt: fixtures.clock.now() },
    source: { kind: "common" }, contact: { type: "email", value: user.email }, baseEvidence: null, localProof: null,
    currentConnection: null, membership: null, allowlistEntry: null, contactBinding: null };
}

/** @returns An original pending request and current policy, without mutating or sending. */
function whatsappPending() {
  const facts = whatsappFacts();
  const request = createPendingAdmissionRequest({ id: "request", tribeId: facts.tribe.id, userId: facts.account!.userId, source: "common", contact: facts.contact, evidence: { kind: "declared" }, policy: facts.policy!, message: null, now: facts.now });
  return { facts, request };
}

describe("declared admission WhatsApp number", () => {
  it("should default to optional and permit email manual OFF without a phone or provider", () => {
    const facts = whatsappFacts();
    expect(facts.policy).toMatchObject({ requiresWhatsappNumber: false, requiresAdditionalVerification: false });
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "pending", evidenceKind: "declared", bindContact: false });
    expect(normalizeAdmissionWhatsappNumber(undefined)).toBeNull();
  });

  it("should normalize an international number without changing the primary contact or creating proof", () => {
    const facts = whatsappFacts();
    facts.policy!.requiresWhatsappNumber = true;
    facts.whatsappNumber = normalizeAdmissionWhatsappNumber(" +1 (415) 555-2671 ");
    expect(facts.whatsappNumber).toBe("+14155552671");
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "pending", evidenceKind: "declared", bindContact: false });
    expect(facts).toMatchObject({ contact: { type: "email" }, localProof: null, currentConnection: null, contactBinding: null });
  });

  it.each(["4155552671", "+14155552671 ext. 5", "invalid", "+000"])("should reject unusable declared input %s without exposing it", (value) => {
    expect(() => normalizeAdmissionWhatsappNumber(value)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should require the number on submission and on an existing pending after the leader enables it", () => {
    const { facts, request } = whatsappPending();
    facts.policy!.requiresWhatsappNumber = true;
    expect(evaluateAdmissionSubmission(facts)).toEqual({ outcome: "denied", reason: "whatsapp_number_required" });
    const pending = { ...facts, request: { id: request.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null } };
    expect(evaluatePendingAdmissionEligibility(pending)).toEqual({ eligible: false, reason: "whatsapp_number_required" });
    expect(evaluatePendingAdmissionEligibility({ ...pending, whatsappNumber: "+14155552671" })).toEqual({ eligible: true, requiresExceptionReason: false });
  });

  it("should change the requirement with policy CAS while preserving the verification epoch and unused evidence", () => {
    const current = whatsappFacts().policy!;
    const facts = { tribeId: current.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null };
    expect(proposeAdmissionPolicyChange(current, { requiresWhatsappNumber: true }, current.version, facts)).toMatchObject({ outcome: "changed", policy: { requiresWhatsappNumber: true, version: 2, verificationEpoch: 1 }, invalidateUnappliedEvidence: false });
    expect(current).toMatchObject({ version: 1, requiresWhatsappNumber: false });
    expect(proposeAdmissionPolicyChange({ ...current, version: 2 }, { requiresWhatsappNumber: true }, 1, facts)).toMatchObject({ outcome: "conflict" });
  });

  it("should keep the current code requirement visible when the declared number is also missing", () => {
    const { facts, request } = whatsappPending();
    facts.policy = { ...facts.policy!, requiresWhatsappNumber: true, requiresAdditionalVerification: true };
    const validRequest = { ...request, id: "b13d9a1a-ec92-43d6-86dc-4a5bc231c9ca", tribeId: "69c24498-2d5e-4705-9b19-f5fa754b00d2" };
    facts.tribe.id = validRequest.tribeId;
    facts.policy.tribeId = validRequest.tribeId;
    const review = { ...facts, request: { id: validRequest.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null }, reviewer: { userId: "reviewer", tribeId: validRequest.tribeId, role: "guardian" as const, status: "active" as const } };
    expect(projectAdmissionReview({ request: validRequest, applicantName: "Synthetic applicant", review, approvalSupported: true, internalReason: null, externalMessage: null })).toMatchObject({ needsVerification: true, eligibilityReasons: ["whatsapp_number_required"], eligibleActions: ["reject"] });
    expect(evaluateAdmissionSubmission({ ...facts, whatsappNumber: "+14155552671" })).toMatchObject({ outcome: "verification_required", reason: "local_proof_required" });
  });

  it("should update only an own pending number and version, preserving its evidence and original deadline", () => {
    const { facts, request } = whatsappPending();
    const result = proposeAdmissionWhatsappNumberChange({ request, policy: facts.policy!, actorUserId: request.userId, expectedVersion: 1, whatsappNumber: "+14155552671", now: facts.now });
    expect(result).toMatchObject({ outcome: "changed", request: { whatsappNumber: "+14155552671", version: 2, status: "pending", contact: request.contact, evidence: request.evidence, submittedAt: request.submittedAt, expiresAt: request.expiresAt } });
    expect(request).toMatchObject({ whatsappNumber: null, version: 1 });
    if (result.outcome !== "changed") throw new Error("Expected a declared number change");
    expect(proposeAdmissionWhatsappNumberChange({ request: result.request, policy: facts.policy!, actorUserId: request.userId, expectedVersion: 2, whatsappNumber: "+14155552671", now: facts.now })).toMatchObject({ outcome: "unchanged", request: { version: 2 } });
  });

  it("should edit only the declared-number requirement even when the code channel is unavailable", () => {
    const current = { ...whatsappFacts().policy!, requiresAdditionalVerification: true, contactType: "phone" as const, phoneChannel: "sms" as const };
    const facts = { tribeId: current.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null };
    expect(proposeAdmissionPolicyChange(current, { requiresWhatsappNumber: true }, current.version, facts)).toMatchObject({ outcome: "changed", policy: { version: 2, verificationEpoch: 1, requiresAdditionalVerification: true, requiresWhatsappNumber: true }, invalidateUnappliedEvidence: false });
    expect(proposeAdmissionPolicyChange(current, { requiresWhatsappNumber: true, isOpen: true, allowCommonExceptions: true }, current.version, facts)).toMatchObject({ outcome: "invalid", reason: "verification_unavailable" });
  });

  it("should reject stale, foreign, expired and terminal changes without replacing current versions", () => {
    const { facts, request } = whatsappPending();
    const input = { request, policy: facts.policy!, actorUserId: request.userId, expectedVersion: 1, whatsappNumber: "+14155552671", now: facts.now };
    expect(proposeAdmissionWhatsappNumberChange({ ...input, expectedVersion: 2 })).toMatchObject({ outcome: "denied", code: "request_conflict" });
    expect(proposeAdmissionWhatsappNumberChange({ ...input, actorUserId: "another-user" })).toMatchObject({ outcome: "denied", code: "permission_denied" });
    expect(proposeAdmissionWhatsappNumberChange({ ...input, policy: { ...input.policy, tribeId: "another-tribe" } })).toMatchObject({ outcome: "denied", code: "permission_denied" });
    expect(proposeAdmissionWhatsappNumberChange({ ...input, now: request.expiresAt })).toMatchObject({ outcome: "denied", code: "admission_ineligible" });
    expect(proposeAdmissionWhatsappNumberChange({ ...input, request: { ...request, status: "approved" } })).toMatchObject({ outcome: "denied", code: "request_conflict" });
  });

  it("should permit removal only while the current leader requirement remains optional", () => {
    const { facts, request } = whatsappPending();
    const input = { request: { ...request, whatsappNumber: "+14155552671" }, policy: facts.policy!, actorUserId: request.userId, expectedVersion: 1, whatsappNumber: null, now: facts.now };
    expect(proposeAdmissionWhatsappNumberChange(input)).toMatchObject({ outcome: "changed", request: { whatsappNumber: null, version: 2 } });
    expect(proposeAdmissionWhatsappNumberChange({ ...input, policy: { ...input.policy, requiresWhatsappNumber: true } })).toMatchObject({ outcome: "denied", code: "whatsapp_number_required" });
  });
});
