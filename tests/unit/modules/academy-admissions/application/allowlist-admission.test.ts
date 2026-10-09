/** Exercises trusted list admission proposals and the exact synthetic 800/200 split; SQL effects are verified separately. @module allowlist-admission-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { proposeAutomaticAdmissionDecision, type AutomaticAdmissionFacts } from "@/src/modules/academy-admissions/domain/entities/automatic-admission-decision";
import { evaluateAdmissionSubmission } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";

/** @returns Current isolated facts with trusted Google base evidence and an enabled exact entry. */
function fixture() {
  const now = new Date("2026-10-09T12:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), identityEvidenceId = randomUUID(), email = "exact.name+tag@gmail.com";
  const policy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), mode: "allowlist" as const, isOpen: true, allowCommonExceptions: true, activatedAt: new Date("2026-10-09T11:00:00Z") };
  const contact = { type: "email" as const, value: email }, verifiedAt = new Date("2026-10-09T11:59:00Z");
  const facts: AutomaticAdmissionFacts = { now, tribe: { id: tribeId, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false }, account: { userId, normalizedEmail: email, googleAccount: { id: accountId, subject } }, policy, source: { kind: "common" }, contact, baseEvidence: { id: identityEvidenceId, verifiedAt, userId, accountId, subject, normalizedEmail: email, authority: "gmail", invalidated: false }, localProof: null, currentConnection: null, membership: null, contactBinding: null, allowlistEntry: { id: randomUUID(), version: 1, tribeId, contact, enabled: true, boundUserId: null } };
  const request = createPendingAdmissionRequest({ id: randomUUID(), tribeId, userId, source: "common", contact, evidence: { kind: "base", identityEvidenceId, verifiedAt: new Date("2026-10-09T11:59:00Z") }, bindingId: randomUUID(), policy, requiresAllowlist: true, message: null, now });
  return { facts, request, now, identityEvidenceId };
}
describe("trusted allowlist admission", () => {
  it("should propose one approved system decision with original evidence and private entry/version without modifying list or request inputs", () => {
    const data = fixture(), decisionId = randomUUID(), originalVersion = data.facts.allowlistEntry!.version;
    const proposal = proposeAutomaticAdmissionDecision({ ...data, decisionId });
    expect(proposal).toMatchObject({ allowed: true, request: { status: "approved", version: 2, decisionId }, decision: { actorKind: "system", actorUserId: null, outcome: "approved", requestVersion: 1, evidenceSnapshot: { kind: "base", referenceId: data.identityEvidenceId } }, authorization: { entryId: data.facts.allowlistEntry!.id, version: 1 }, membershipEffect: { role: "tribemate", status: "active" } });
    expect(data.request.status).toBe("pending"); expect(data.facts.allowlistEntry!.version).toBe(originalVersion);
  });
  it("should keep a missing or disabled match in explicit review and never approve a forwarded identity or another binding owner", () => {
    const data = fixture();
    for (const facts of [{ ...data.facts, allowlistEntry: null }, { ...data.facts, allowlistEntry: { ...data.facts.allowlistEntry!, enabled: false } }, { ...data.facts, contact: { type: "email" as const, value: "forwarded@gmail.com" } }, { ...data.facts, contactBinding: { ownerUserId: randomUUID(), contact: data.facts.contact! } }]) expect(proposeAutomaticAdmissionDecision({ ...data, facts, decisionId: randomUUID() })).toMatchObject({ allowed: false });
    expect(evaluateAdmissionSubmission({ ...data.facts, allowlistEntry: null })).toMatchObject({ outcome: "pending", requiresExceptionReason: true });
    expect(evaluateAdmissionSubmission({ ...data.facts, allowlistEntry: null, policy: { ...data.facts.policy!, allowCommonExceptions: false } })).toMatchObject({ outcome: "denied" });
  });
  it("should preserve exact normalized email aliases and yield precisely 800 automatic proposals and 200 exception reviews for 1000 synthetic contacts", () => {
    const normalized = normalizeAdmissionContact({ type: "email", value: " EXACT.Name+Tag@GMAIL.COM " });
    expect(normalized).toMatchObject({ status: "valid", contact: { value: "exact.name+tag@gmail.com" } });
    const data = fixture(); let admitted = 0, pending = 0;
    for (let index = 0; index < 1000; index += 1) {
      const email = `sample.${index}+tag@gmail.com`, userId = randomUUID(), contact = { type: "email" as const, value: email };
      const facts = { ...data.facts, account: { ...data.facts.account!, userId, normalizedEmail: email }, contact, baseEvidence: { ...data.facts.baseEvidence!, userId, normalizedEmail: email }, allowlistEntry: index < 800 ? { ...data.facts.allowlistEntry!, contact } : null };
      const outcome = evaluateAdmissionSubmission(facts);
      if (outcome.outcome === "admitted") {
        const request = { ...data.request, userId, contact };
        expect(proposeAutomaticAdmissionDecision({ facts, request, decisionId: randomUUID(), now: data.now })).toMatchObject({ allowed: true }); admitted += 1;
      } else if (outcome.outcome === "pending") { expect(outcome.requiresExceptionReason).toBe(true); pending += 1; }
    }
    expect({ admitted, pending }).toEqual({ admitted: 800, pending: 200 });
  });
});
