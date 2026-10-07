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
  const policy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), isOpen: true, activatedAt: now };
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

  it("should deny self decisions and expired requests without changing the recorded resource version", () => {
    const record = reviewRecord();
    record.review.reviewer!.userId = record.request.userId;
    expect(projectAdmissionReview(record).eligibleActions).toEqual([]);
    record.review.reviewer!.userId = randomUUID();
    record.review.now = record.request.expiresAt;
    expect(projectAdmissionReview(record)).toMatchObject({ version: 1, status: "pending", eligibleActions: [], eligibilityReasons: ["request_expired"] });
  });
});
