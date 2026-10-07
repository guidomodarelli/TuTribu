/** Exercises external request resolution as a pure domain contract, never as an access grant. @module admission-external-resolution-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { proposeAdmissionExternalResolution, type AdmissionExternalResolutionFacts } from "@/src/modules/academy-admissions/domain/policies/admission-external-resolution";
import type { AdmissionMembershipFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";

/** Builds a pending request with original personal authorization and attached local proof provenance. */
function fixture() {
  const tribeId = randomUUID(), userId = randomUUID(), now = new Date("2026-10-07T00:00:00Z");
  const policy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), isOpen: true, activatedAt: now };
  const request = createPendingAdmissionRequest({ id: randomUUID(), tribeId, userId, source: "personal", invitationId: randomUUID(), requiresAllowlist: true, contact: { type: "email", value: "applicant@example.test" }, evidence: { kind: "local", proofId: randomUUID(), verifiedAt: now }, bindingId: randomUUID(), policy, message: "Mi presentación", now });
  const facts: AdmissionExternalResolutionFacts = { tribeId, userId, academyAvailable: true, accountAvailable: true, membershipDeleted: false, membership: null, policy };
  const membership: AdmissionMembershipFacts = { tribeId, userId, role: "tribemate", status: "active", statusReason: "none", commercialRecoveryStatus: null };
  return { request, facts, membership, input: { request, expectedVersion: 1, decisionId: randomUUID(), facts, now } };
}

describe("admission external resolution", () => {
  it.each(["active", "muted"] as const)("should cancel a pending request after legitimate %s membership without consuming its invitation again", (status) => {
    const data = fixture(), original = structuredClone(data.request);
    data.facts.membership = { ...data.membership, status };
    const proposal = proposeAdmissionExternalResolution(data.input);
    expect(proposal).toMatchObject({ allowed: true, changed: true, request: { status: "cancelled", version: 2, cancelReason: "external_resolution" }, decision: { actorKind: "system", actorUserId: null, outcome: "cancelled", rule: "external_resolution", membershipEffectId: null } });
    if (proposal.allowed && proposal.changed) {
      expect(proposal.request).toMatchObject({ invitationId: original.invitationId, proofId: original.proofId, bindingId: original.bindingId, submittedAt: original.submittedAt, expiresAt: original.expiresAt, applicantMessage: original.applicantMessage, originalPolicy: original.originalPolicy });
      expect(proposal.decision.requestVersion).toBe(1);
    }
    expect(data.request).toEqual(original);
    expect(data.facts.membership.status).toBe(status);
  });

  it.each([
    ["academyAvailable", "academy_unavailable"],
    ["accountAvailable", "account_deleted"],
    ["membershipDeleted", "membership_deleted"],
  ] as const)("should terminally cancel on %s and never resurrect that request when the product facts return", (field, rule) => {
    const data = fixture();
    data.facts[field] = field === "membershipDeleted";
    const proposal = proposeAdmissionExternalResolution(data.input);
    expect(proposal).toMatchObject({ allowed: true, changed: true, request: { status: "cancelled", cancelReason: rule }, decision: { rule, membershipEffectId: null } });
    if (!proposal.allowed || !proposal.changed) throw new Error("Expected external terminal proposal");
    data.facts[field] = field !== "membershipDeleted";
    expect(proposeAdmissionExternalResolution({ ...data.input, request: proposal.request, expectedVersion: 2 })).toEqual({ allowed: false, code: "request_conflict" });
  });

  it.each(["blocked", "removed"] as const)("should cancel a nonrecoverable %s membership without lifting moderation", (status) => {
    const data = fixture(); data.facts.membership = { ...data.membership, status, statusReason: "conduct_blocked" };
    expect(proposeAdmissionExternalResolution(data.input)).toMatchObject({ allowed: true, changed: true, request: { status: "cancelled", cancelReason: "nonrecoverable_membership" }, decision: { rule: "nonrecoverable_membership", membershipEffectId: null } });
    expect(data.facts.membership).toMatchObject({ status, statusReason: "conduct_blocked" });
  });

  it.each([
    ["blocked", "payment_blocked"],
    ["removed", "subscription_inactive"],
  ] as const)("should retain a pending request during commercial %s without pretending recovery already happened", (status, statusReason) => {
    const data = fixture(); data.facts.membership = { ...data.membership, status, statusReason, commercialRecoveryStatus: "muted" };
    expect(proposeAdmissionExternalResolution(data.input)).toEqual({ allowed: true, changed: false, request: data.request, decision: null });
  });

  it("should leave absence and a paused or more permissive policy pending without manufacturing admission", () => {
    const data = fixture(); data.facts.policy = { ...data.facts.policy!, version: 2 };
    expect(proposeAdmissionExternalResolution(data.input)).toEqual({ allowed: true, changed: false, request: data.request, decision: null });
    data.facts.policy = null;
    expect(proposeAdmissionExternalResolution(data.input)).toEqual({ allowed: true, changed: false, request: data.request, decision: null });
  });

  it("should choose authoritative expiry at the original deadline before a newly observed external membership", () => {
    const data = fixture(); data.facts.membership = data.membership;
    expect(proposeAdmissionExternalResolution({ ...data.input, now: data.request.expiresAt })).toMatchObject({ allowed: true, changed: true, request: { status: "expired", cancelReason: null }, decision: { rule: "expired", outcome: "expired", actorKind: "system", membershipEffectId: null } });
  });

  it("should record the current policy epoch without rewriting the original snapshot or deadline", () => {
    const data = fixture(); data.facts.membership = data.membership; data.facts.policy = { ...data.facts.policy!, version: 5, verificationEpoch: 3 };
    const proposal = proposeAdmissionExternalResolution(data.input);
    expect(proposal).toMatchObject({ allowed: true, changed: true, request: { originalPolicy: { version: 1, verificationEpoch: 1 }, expiresAt: data.request.expiresAt }, decision: { policyVersion: 5, verificationEpoch: 3 } });
  });

  it("should reject mismatched owner scopes, stale versions and contradictory deletion facts without changing the original", () => {
    const data = fixture(), original = structuredClone(data.request);
    expect(proposeAdmissionExternalResolution({ ...data.input, expectedVersion: 2 })).toEqual({ allowed: false, code: "request_conflict" });
    expect(proposeAdmissionExternalResolution({ ...data.input, facts: { ...data.facts, userId: randomUUID() } })).toEqual({ allowed: false, code: "resource_unavailable" });
    expect(proposeAdmissionExternalResolution({ ...data.input, facts: { ...data.facts, membership: { ...data.membership, tribeId: randomUUID() } } })).toEqual({ allowed: false, code: "resource_unavailable" });
    expect(proposeAdmissionExternalResolution({ ...data.input, facts: { ...data.facts, membershipDeleted: true, membership: data.membership } })).toEqual({ allowed: false, code: "invalid_input" });
    expect(proposeAdmissionExternalResolution({ ...data.input, now: new Date("invalid") })).toEqual({ allowed: false, code: "invalid_input" });
    expect(data.request).toEqual(original);
  });
});
