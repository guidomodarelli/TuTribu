/** @vitest-environment node */
/** Exercises reviewer display contracts and current domain policy without platform or provider doubles. @module admission-review-projection-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { projectAdmissionReview } from "@/src/modules/academy-admissions/application/results/admission-review-projection";
import { admissionRequestSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionReviewRecord } from "@/src/modules/academy-admissions/domain/repositories/admission-review-reader";

/** Constructs only current owned domain facts; no HTTP, database or credential is required. */
function reviewRecord(): AdmissionReviewRecord {
  const tribeId = randomUUID(), userId = randomUUID(), now = new Date("2026-10-07T03:00:00Z");
  const policy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), requiresWhatsappNumber: false, isOpen: true, activatedAt: now };
  const contact = { type: "email" as const, value: "applicant@example.test" };
  const request = createPendingAdmissionRequest({ id: randomUUID(), tribeId, userId, source: "common", contact, evidence: { kind: "declared" }, policy, message: "Quiero participar.", now });
  return { request, approvalSupported: true, applicantName: "Solicitante sintético", internalReason: "Motivo privado de revisión", externalMessage: "Mensaje que puede ver el solicitante.", review: {
    now, tribe: { id: tribeId, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false },
    account: { userId, normalizedEmail: contact.value, googleAccount: null }, policy, source: { kind: "common" }, contact,
    baseEvidence: null, localProof: null, currentConnection: null, membership: null, allowlistEntry: null, contactBinding: null,
    request: { id: request.id, userId, expiresAt: request.expiresAt, source: { kind: "common" }, attachedEvidence: null },
    reviewer: { userId: randomUUID(), tribeId, role: "guardian", status: "active" },
  } };
}

describe("admission reviewer projection", () => {
  it.each([
    ["2026-10-07T02:59:59.999Z", false],
    ["2026-10-10T02:59:59.999Z", false],
    ["2026-10-10T03:00:00.000Z", true],
    ["2026-10-10T03:00:00.001Z", true],
  ])("should expose the pending age threshold from the authoritative read clock %s as %s", (observedAt, expected) => {
    const record = reviewRecord();
    record.review.now = new Date(observedAt);
    const result = projectAdmissionReview(record);
    expect(result.pendingAgeThresholdReached).toBe(expected);
    expect(result).toMatchObject({ status: "pending", version: 1, submittedAt: "2026-10-07T03:00:00.000Z" });
    expect(admissionRequestSchema.parse(result)).not.toHaveProperty("pendingAgeThresholdReached");
  });

  it.each(["approved", "rejected", "cancelled", "expired"] as const)("should remove the age highlight for a terminal %s request", (status) => {
    const record = reviewRecord();
    record.request.status = status;
    record.review.now = new Date("2026-10-10T03:00:00.000Z");
    record.request.resolvedAt = record.review.now;
    expect(projectAdmissionReview(record)).toMatchObject({ status, pendingAgeThresholdReached: false });
  });

  it("should keep an old unexpired request highlighted during pause and clear it at expiration", () => {
    const record = reviewRecord();
    record.review.policy!.isOpen = false;
    record.review.now = new Date("2026-10-10T03:00:00.000Z");
    expect(projectAdmissionReview(record)).toMatchObject({ pendingAgeThresholdReached: true, eligibleActions: ["reject"] });
    record.review.now = record.request.expiresAt;
    expect(projectAdmissionReview(record)).toMatchObject({ pendingAgeThresholdReached: false, eligibleActions: [], eligibilityReasons: ["request_expired"] });
  });

  it("should offer an explicit exception approval when only its editable internal reason is missing", () => {
    const record = reviewRecord();
    record.review.policy!.mode = "allowlist"; record.review.policy!.allowCommonExceptions = true;
    expect(projectAdmissionReview(record)).toMatchObject({ eligibilityReasons: ["exception_reason_required"], restrictions: { requiresExceptionReason: true }, eligibleActions: ["reject", "approve"] });
    record.review.policy!.requiresAdditionalVerification = true;
    expect(projectAdmissionReview(record)).toMatchObject({ eligibilityReasons: ["local_proof_required"], needsVerification: true, restrictions: { requiresExceptionReason: false }, eligibleActions: ["reject"] });
  });

  it.each([false, true])("should mark a pending request with revoked applied evidence as needing verification even when verification ON is %s", (verificationEnabled) => {
    const record = reviewRecord(), proofId = randomUUID();
    record.review.policy!.requiresAdditionalVerification = verificationEnabled;
    record.request.evidence = { kind: "local", proofId, verifiedAt: record.review.now };
    record.review.request.attachedEvidence = { id: proofId, appliedRequestId: record.request.id, userId: record.request.userId, tribeId: record.request.tribeId, contact: record.request.contact!, purpose: "admission", verificationEpoch: record.review.policy!.verificationEpoch, connectionId: randomUUID(), connectionVersion: 1, securityEpoch: "synthetic-compromised-epoch", status: "invalid", verifiedAt: record.review.now, applyBefore: record.review.now };
    expect(projectAdmissionReview(record)).toMatchObject({ needsVerification: true, eligibilityReasons: ["evidence_revoked"], eligibleActions: ["reject"] });
    record.review.now = record.request.expiresAt;
    expect(projectAdmissionReview(record)).toMatchObject({ needsVerification: false, eligibleActions: [] });
  });
  it("should distinguish declared contact from verification and keep applicant message separate from reviewer notes", () => {
    const record = reviewRecord(), review = projectAdmissionReview(record);
    expect(review).toMatchObject({ applicant: { id: record.request.userId }, applicantMessage: "Quiero participar.", internalReason: "Motivo privado de revisión", externalMessage: "Mensaje que puede ver el solicitante.", evidence: { kind: "declared" }, rawContact: "applicant@example.test" });
    expect(review.evidence).not.toHaveProperty("verifiedAt");
    expect(review.eligibleActions).toEqual(["reject", "approve"]);
    const own = admissionRequestSchema.parse(review);
    expect(own).not.toHaveProperty("applicantMessage");
    expect(own).not.toHaveProperty("internalReason");
    expect(own).not.toHaveProperty("rawContact");
  });

  it("should keep rejection available during pause while suppressing approval", () => {
    const record = reviewRecord();
    record.review.policy!.isOpen = false;
    expect(projectAdmissionReview(record).eligibleActions).toEqual(["reject"]);
  });

  it.each(["security_unconfigured", "recovery_locked"] as const)("should offer neither approval nor rejection while the platform requirement %s keeps every decision from being protected", (platformRequirement) => {
    const record = reviewRecord();
    expect(projectAdmissionReview(record).eligibleActions).toEqual(["reject", "approve"]);
    expect(projectAdmissionReview(record, platformRequirement)).toMatchObject({ status: "pending", version: 1, eligibleActions: [] });
  });

  it("should deny self decisions and expired requests without changing the recorded resource version", () => {
    const record = reviewRecord();
    record.review.reviewer!.userId = record.request.userId;
    expect(projectAdmissionReview(record).eligibleActions).toEqual([]);
    record.review.reviewer!.userId = randomUUID();
    record.review.now = record.request.expiresAt;
    expect(projectAdmissionReview(record)).toMatchObject({ version: 1, status: "pending", eligibleActions: [], eligibilityReasons: ["request_expired"] });
  });
});
