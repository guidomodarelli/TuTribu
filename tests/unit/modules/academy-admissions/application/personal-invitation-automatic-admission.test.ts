/** Exercises real personal automatic authorization without fabricating an enabled list entry for an explicit exemption. @module personal-invitation-automatic-admission-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { proposeAutomaticAdmissionDecision, type AutomaticAdmissionFacts } from "@/src/modules/academy-admissions/domain/entities/automatic-admission-decision";
import { proposeAdmissionDecision } from "@/src/modules/academy-admissions/domain/entities/admission-decision";

/** @returns Exact personal recipient with genuine inward base provenance and an explicit list exemption. */
function fixture() {
  const now = new Date("2026-10-09T12:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), invitationId = randomUUID(), identityEvidenceId = randomUUID(), verifiedAt = new Date("2026-10-09T11:59:00Z");
  const contact = { type: "email" as const, value: "personal.recipient+tag@gmail.com" };
  const policy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), mode: "allowlist" as const, isOpen: true, activatedAt: new Date("2026-10-09T11:00:00Z") };
  const invitation = { id: invitationId, version: 1, tribeId, contact, requiresAllowlist: false, status: "active" as const, authorizationRevoked: false, expiresAt: new Date("2026-10-16T12:00:00Z") };
  const facts: AutomaticAdmissionFacts = { now, tribe: { id: tribeId, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false }, account: { userId, normalizedEmail: contact.value, googleAccount: { id: accountId, subject } }, policy, source: { kind: "personal", invitation }, contact, baseEvidence: { id: identityEvidenceId, verifiedAt, userId, accountId, subject, normalizedEmail: contact.value, authority: "gmail", invalidated: false }, localProof: null, currentConnection: null, membership: null, contactBinding: { ownerUserId: userId, contact }, allowlistEntry: null };
  const request = createPendingAdmissionRequest({ id: randomUUID(), tribeId, userId, source: "personal", invitationId, contact, evidence: { kind: "base", identityEvidenceId, verifiedAt }, bindingId: randomUUID(), policy, requiresAllowlist: false, message: null, now });
  return { facts, request, now, invitation, decisionId: randomUUID() };
}

describe("personal invitation automatic authorization", () => {
  it("should require the original verified binding for manual approval and keep the redeemed request independent of link expiry", () => {
    const data = fixture(), reviewer = { userId: randomUUID(), tribeId: data.request.tribeId, role: "leader" as const, status: "active" as const };
    const source = { kind: "personal" as const, invitation: { ...data.invitation, status: "redeemed" as const, expiresAt: new Date("2026-10-09T11:59:00Z") } };
    const review = { ...data.facts, policy: { ...data.facts.policy!, mode: "manual_review" as const }, source, reviewer, request: { id: data.request.id, userId: data.request.userId, expiresAt: data.request.expiresAt, source, attachedEvidence: null } };
    const input = { request: data.request, expectedVersion: 1, decisionId: randomUUID(), decision: "approve" as const, actor: reviewer, review, internalReason: "Destinatario probado y revisado", externalMessage: null, now: data.now };
    expect(proposeAdmissionDecision({ ...input, request: { ...data.request, bindingId: null } })).toMatchObject({ allowed: false, code: "admission_ineligible" });
    expect(proposeAdmissionDecision(input)).toMatchObject({ allowed: true, request: { status: "approved" }, decision: { actorKind: "user" } });
    expect(proposeAdmissionDecision({ ...input, review: { ...review, request: { ...review.request, source: { ...source, invitation: { ...source.invitation, authorizationRevoked: true } } } } })).toMatchObject({ allowed: false, code: "admission_ineligible" });
  });
  it("should approve the proven exempt recipient as system without inventing list authorization or editing the invitation", () => {
    const data = fixture();
    expect(proposeAutomaticAdmissionDecision(data)).toMatchObject({ allowed: true, authorization: null, request: { status: "approved", version: 2 }, decision: { actorKind: "system", actorUserId: null, rule: "automatic", evidenceSnapshot: { kind: "base" } }, membershipEffect: { role: "tribemate", status: "active" } });
    expect(data.request.status).toBe("pending"); expect(data.invitation).toMatchObject({ status: "active", version: 1 });
  });
  it("should keep required list authorization exact and refuse missing, disabled or another recipient entries", () => {
    const data = fixture(), source = { kind: "personal" as const, invitation: { ...data.invitation, requiresAllowlist: true } }, request = { ...data.request, requiresAllowlist: true };
    const entry = { id: randomUUID(), version: 3, tribeId: data.request.tribeId, contact: data.invitation.contact, enabled: true, boundUserId: data.request.userId };
    expect(proposeAutomaticAdmissionDecision({ ...data, request, facts: { ...data.facts, source, allowlistEntry: entry } })).toMatchObject({ allowed: true, authorization: { entryId: entry.id, version: 3 } });
    for (const allowlistEntry of [null, { ...entry, enabled: false }, { ...entry, contact: { type: "email" as const, value: "another@gmail.com" } }]) expect(proposeAutomaticAdmissionDecision({ ...data, request, facts: { ...data.facts, source, allowlistEntry } })).toMatchObject({ allowed: false });
  });
  it("should refuse a crossed invitation identity or a request that changes its immutable list requirement", () => {
    const data = fixture();
    expect(proposeAutomaticAdmissionDecision({ ...data, request: { ...data.request, invitationId: randomUUID() } })).toMatchObject({ allowed: false });
    expect(proposeAutomaticAdmissionDecision({ ...data, request: { ...data.request, requiresAllowlist: true } })).toMatchObject({ allowed: false });
  });
  it("should refuse lost recipient evidence, consumed/revoked/expired resources and a manual policy without granting an automatic decision", () => {
    const data = fixture();
    const proposals: AutomaticAdmissionFacts[] = [
      { ...data.facts, baseEvidence: null },
      { ...data.facts, baseEvidence: { ...data.facts.baseEvidence!, invalidated: true } },
      { ...data.facts, policy: { ...data.facts.policy!, mode: "manual_review" } },
      ...(["redeemed", "revoked", "expired"] as const).map((status) => ({ ...data.facts, source: { kind: "personal" as const, invitation: { ...data.invitation, status } } })),
      { ...data.facts, source: { kind: "personal", invitation: { ...data.invitation, authorizationRevoked: true } } },
      { ...data.facts, source: { kind: "personal", invitation: { ...data.invitation, expiresAt: data.now } } },
    ];
    for (const facts of proposals) expect(proposeAutomaticAdmissionDecision({ ...data, facts })).toMatchObject({ allowed: false });
  });
});
