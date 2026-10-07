/** @vitest-environment node */
/** Exercises reasoned retry proposals without rewriting a terminal admission or granting access. @module admission-retry-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { proposeAdmissionRetry } from "@/src/modules/academy-admissions/domain/policies/admission-retry";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

/** Builds a genuine terminal proposal whose original lifetime/source remain fixed. */
function rejectedRequest() {
  const now = new Date("2026-10-07T00:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  const policy = { ...createDefaultAdmissionPolicy({ id: randomUUID(), tribeId }), activatedAt: now, isOpen: true };
  const pending = createPendingAdmissionRequest({ id: randomUUID(), tribeId, userId, source: "common", contact: null, evidence: { kind: "none" }, policy, message: null, now });
  const request = { ...pending, status: "rejected" as const, version: 2, decisionId: randomUUID(), resolvedAt: now };
  const actor = { userId: randomUUID(), tribeId, role: "leader" as const, status: "active" as const };
  return { request, actor, now: new Date(now.getTime() + 60_000) };
}

describe("reasoned admission early retry", () => {
  it("should change only retry eligibility and its version while retaining rejection, source, decision and original deadline", () => {
    const fixture = rejectedRequest();
    const proposal = proposeAdmissionRetry({ ...fixture, expectedVersion: 2, internalReason: "Corrección solicitada" });
    expect(proposal).toMatchObject({ allowed: true, changed: true, request: { status: "rejected", version: 3, decisionId: fixture.request.decisionId, expiresAt: fixture.request.expiresAt, submittedAt: fixture.request.submittedAt, retryAllowedAt: fixture.now } });
    expect(fixture.request.retryAllowedAt).toBeNull();
  });

  it("should deny a guardian, a stale request, missing reason and an already approved request", () => {
    const fixture = rejectedRequest(), input = { ...fixture, expectedVersion: 2, internalReason: "Corrección" };
    expect(proposeAdmissionRetry({ ...input, actor: { ...fixture.actor, role: "guardian" } })).toMatchObject({ allowed: false, code: "permission_denied" });
    expect(proposeAdmissionRetry({ ...input, expectedVersion: 1 })).toMatchObject({ allowed: false, code: "request_conflict" });
    expect(proposeAdmissionRetry({ ...input, internalReason: " " })).toMatchObject({ allowed: false, code: "invalid_input" });
    expect(proposeAdmissionRetry({ ...input, request: { ...fixture.request, status: "approved" } })).toMatchObject({ allowed: false, code: "request_conflict" });
  });

  it("should preserve a current no-op and close unknown rejected history instead of inventing its date", () => {
    const fixture = rejectedRequest(), input = { ...fixture, expectedVersion: 2, internalReason: "Corrección" };
    expect(proposeAdmissionRetry({ ...input, now: new Date(fixture.request.resolvedAt.getTime() + ADMISSION_LIMIT.rejectionRetryWaitMs) })).toMatchObject({ allowed: true, changed: false, request: { version: 2, retryAllowedAt: null } });
    expect(proposeAdmissionRetry({ ...input, request: { ...fixture.request, resolvedAt: null } })).toMatchObject({ allowed: false, code: "resource_unavailable" });
  });
});
