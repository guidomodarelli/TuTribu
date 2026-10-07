/** @vitest-environment node */
/** Exercises current review authorization and absence through only the application's own ports. @module get-admission-review-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionReviewUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-use-cases";
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AdmissionReviewReader } from "@/src/modules/academy-admissions/domain/repositories/admission-review-reader";

/** Supplies native-derived private context semantics without exposing a role or actor as query input. */
function fixture() {
  const tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), requestId = randomUUID();
  const context = { tribeId, userId, sessionId, requestId, role: "guardian" as const, membershipStatus: "active" as const, action: "read_inbox" as const, resourceId: tribeId };
  const resolver = { execute: vi.fn<ResolveAdmissionContextUseCase["execute"]>(async () => ({ allowed: true, context })) };
  const reader: AdmissionReviewReader = { readList: vi.fn(async () => ({ records: [], nextCursor: null })), readDetail: vi.fn(async () => null) };
  return { resolver, reader, context, query: { tribeId, requestId, limit: 25 }, useCases: new GetAdmissionReviewUseCases(resolver, reader) };
}

describe("current admission review reads", () => {
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
});
