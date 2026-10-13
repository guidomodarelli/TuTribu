/** Exercises effective request/decision clocks and private corrective retry provenance. @module admission-request-audit-event-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { createAdmissionRequestAuditEvent, createAdmissionRetryAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-request-audit-event";

/** @returns A request-owned snapshot with private fields deliberately outside audit metadata. */
function requestFixture(): AdmissionRequest {
  return { id: randomUUID(), tribeId: randomUUID(), userId: randomUUID(), source: "common", invitationId: null, legacyInvitationId: null, requiresAllowlist: false, contact: { type: "email", value: "private@example.test" }, evidence: { kind: "declared" }, bindingId: null, proofId: null, originalPolicy: { version: 2, verificationEpoch: 3, mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, allowCommonExceptions: false }, applicantMessage: "private-applicant-message", status: "pending", submittedAt: new Date("2026-10-13T18:00:00Z"), expiresAt: new Date("2026-11-12T18:00:00Z"), version: 1, decisionId: null, cancelReason: null, resolvedAt: null, retryAllowedAt: null };
}

describe("effective request audit provenance", () => {
  it("should record the original presentation clock and evidence without copying applicant content", () => {
    const request=requestFixture(),operationId=randomUUID();
    const event=createAdmissionRequestAuditEvent({ actorUserId:request.userId,operationId,eventType:"pending_created",request,previous:null,decision:null });
    expect(event).toMatchObject({resourceId:request.id,resourceVersion:1,createdAt:request.submittedAt,operationId,metadata:{fromStatus:null,toStatus:"pending",previousVersion:null,policyVersion:2,verificationEpoch:3,proofId:null,decisionId:null,invitationId:null}});
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|private-applicant-message/);
    request.submittedAt.setUTCDate(14);
    expect(event.createdAt.toISOString()).toBe("2026-10-13T18:00:00.000Z");
  });

  it("should use the effective decision policy and clock instead of the historical presentation policy", () => {
    const original=requestFixture(),decisionId=randomUUID(),proofId=randomUUID();
    const decidedAt=new Date("2026-10-13T18:02:00Z");
    const request={...original,status:"approved" as const,version:2,decisionId,proofId,resolvedAt:decidedAt};
    const event=createAdmissionRequestAuditEvent({actorUserId:randomUUID(),operationId:randomUUID(),eventType:"approved",request,previous:original,decision:{id:decisionId,rule:"manual_review",policyVersion:7,verificationEpoch:8,decidedAt}});
    expect(event).toMatchObject({rule:"manual_review",createdAt:decidedAt,metadata:{fromStatus:"pending",toStatus:"approved",previousVersion:1,policyVersion:7,verificationEpoch:8,proofId,decisionId,invitationId:null}});
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|private-applicant-message/);
  });

  it("should retain the private corrective reason and retry transition without creating another terminal decision", () => {
    const original={...requestFixture(),status:"rejected" as const,version:2,decisionId:randomUUID(),resolvedAt:new Date("2026-10-13T18:01:00Z")};
    const retryAllowedAt=new Date("2026-10-13T18:03:00Z"),request={...original,version:3,retryAllowedAt};
    const event=createAdmissionRetryAuditEvent({actorUserId:randomUUID(),operationId:randomUUID(),request,previous:original,internalReason:"Corrección privada autorizada",retryAllowedAt});
    expect(event).toMatchObject({eventType:"retry_allowed",rule:"leader_corrective_retry",resourceVersion:3,createdAt:retryAllowedAt,metadata:{fromStatus:"rejected",toStatus:"rejected",previousVersion:2,decisionId:original.decisionId,previousRetryAllowedAt:null,retryAllowedAt:retryAllowedAt.toISOString(),internalReason:"Corrección privada autorizada"}});
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|private-applicant-message/);
  });
});
