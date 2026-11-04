/** @vitest-environment node */
/** Exercises current review authorization and absence through only the application's own ports. @module get-admission-review-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionReviewUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-use-cases";
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AdmissionReviewReader, AdmissionReviewRecord } from "@/src/modules/academy-admissions/domain/repositories/admission-review-reader";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { PLATFORM_SECURITY_REQUIREMENT } from "@/src/modules/shared/constants/platform-security";

/** Supplies native-derived private context semantics without exposing a role or actor as query input. */
function fixture() {
  const tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), requestId = randomUUID();
  const context = { tribeId, userId, sessionId, requestId, role: "guardian" as const, membershipStatus: "active" as const, action: "read_inbox" as const, resourceId: tribeId };
  const resolver = { execute: vi.fn<ResolveAdmissionContextUseCase["execute"]>(async () => ({ allowed: true, context })) };
  const reader: AdmissionReviewReader = { readList: vi.fn(async () => ({ records: [], nextCursor: null, platformRequirement: null })), readDetail: vi.fn(async () => null) };
  return { resolver, reader, context, query: { tribeId, requestId, limit: 25 }, useCases: new GetAdmissionReviewUseCases(resolver, reader) };
}

/** @param scope - Tribe and current reviewer the record belongs to. @returns One pending common request the reviewer could otherwise approve or reject. */
function pendingRecord({ tribeId, userId }: { tribeId: string; userId: string }): AdmissionReviewRecord {
  const applicantId = randomUUID(), now = new Date("2026-10-07T03:00:00Z"), contact = { type: "email" as const, value: "applicant@example.test" };
  const policy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), requiresWhatsappNumber: false, isOpen: true, activatedAt: now };
  const request = createPendingAdmissionRequest({ id: randomUUID(), tribeId, userId: applicantId, source: "common", contact, evidence: { kind: "declared" }, policy, message: null, now });
  return { request, approvalSupported: true, applicantName: "Solicitante sintético", internalReason: null, externalMessage: null, review: {
    now, tribe: { id: tribeId, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false },
    account: { userId: applicantId, normalizedEmail: contact.value, googleAccount: null }, policy, source: { kind: "common" }, contact,
    baseEvidence: null, localProof: null, currentConnection: null, membership: null, allowlistEntry: null, contactBinding: null,
    request: { id: request.id, userId: applicantId, expiresAt: request.expiresAt, source: { kind: "common" }, attachedEvidence: null },
    reviewer: { userId, tribeId, role: "guardian", status: "active" },
  } };
}

describe("current admission review reads", () => {
  it("should publish the platform requirement read with the inbox and offer no decision on the list or the detail while it lasts", async () => {
    const data = fixture(), record = pendingRecord(data.context);
    vi.mocked(data.reader.readList).mockResolvedValueOnce({ records: [record], nextCursor: null, platformRequirement: PLATFORM_SECURITY_REQUIREMENT.unconfigured });
    vi.mocked(data.reader.readDetail).mockResolvedValueOnce({ record, platformRequirement: PLATFORM_SECURITY_REQUIREMENT.recoveryLocked });

    const list = await data.useCases.list(data.query);
    const detail = await data.useCases.detail({ ...data.query, admissionRequestId: record.request.id });

    expect(list).toMatchObject({ ok: true, value: { platformRequirement: PLATFORM_SECURITY_REQUIREMENT.unconfigured, items: [{ id: record.request.id, status: "pending", eligibleActions: [] }] } });
    expect(detail).toMatchObject({ ok: true, value: { id: record.request.id, eligibleActions: [] } });
  });

  it("should offer the current decisions when the platform can protect them", async () => {
    const data = fixture(), record = pendingRecord(data.context);
    vi.mocked(data.reader.readList).mockResolvedValueOnce({ records: [record], nextCursor: null, platformRequirement: null });

    expect(await data.useCases.list(data.query)).toMatchObject({ ok: true, value: { platformRequirement: null, items: [{ eligibleActions: ["reject", "approve"] }] } });
  });


  it("should deny an unauthorized actor before invoking private readers", async () => {
    const data = fixture();
    data.resolver.execute.mockResolvedValueOnce({ allowed: false, failure: { code: "permission_denied" } });
    expect(await data.useCases.list(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.reader.readList).not.toHaveBeenCalled();
    expect(data.reader.readDetail).not.toHaveBeenCalled();
  });

  it("should discard even an empty list after current reviewer authority was revoked", async () => {
    const data = fixture();
    data.resolver.execute.mockResolvedValueOnce({ allowed: true, context: data.context }).mockResolvedValueOnce({ allowed: false, failure: { code: "permission_denied" } });
    expect(await data.useCases.list(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.reader.readList).toHaveBeenCalledWith({ tribeId: data.query.tribeId, requestId: data.query.requestId, userId: data.context.userId, sessionId: data.context.sessionId }, expect.objectContaining({ limit: 25 }));
  });

  it("should keep exact scoped absence and reject a changed native session after its read", async () => {
    const data = fixture(), admissionRequestId = randomUUID();
    expect(await data.useCases.detail({ ...data.query, admissionRequestId })).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
    expect(data.resolver.execute).toHaveBeenCalledWith(expect.objectContaining({ action: "read_inbox", resource: { kind: "admission_request", id: admissionRequestId } }));
    data.resolver.execute.mockResolvedValueOnce({ allowed: true, context: data.context }).mockResolvedValueOnce({ allowed: true, context: { ...data.context, sessionId: randomUUID() } });
    expect(await data.useCases.list(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });

  it.each([true, false])("should preserve the current exception filter %s independently of source and verification", async (requiresExceptionReason) => {
    const data = fixture();
    const query = { ...data.query, requiresExceptionReason, needsVerification: false, source: "common" as const, search: "Solicitante", submittedFrom: "2026-10-01T00:00:00Z", submittedUntil: "2026-10-08T00:00:00Z", cursor: { submittedAt: "2026-10-07T00:00:00Z", id: randomUUID() } };
    expect(await data.useCases.list(query)).toEqual({ ok: true, value: { items: [], nextCursor: null, platformRequirement: null } });
    expect(data.reader.readList).toHaveBeenCalledWith({ tribeId: data.context.tribeId, requestId: data.context.requestId, userId: data.context.userId, sessionId: data.context.sessionId }, { limit: query.limit, status: undefined, source: query.source, cursor: query.cursor, search: query.search, needsVerification: false, requiresExceptionReason, submittedFrom: query.submittedFrom, submittedUntil: query.submittedUntil });
    expect(data.resolver.execute).toHaveBeenCalledTimes(2);
  });
});
