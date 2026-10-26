/** Exercises scoped history projection and live authority through the owned application ports. @module admission-review-history-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionReviewHistoryUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-history-use-case";
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AdmissionReviewHistoryReader } from "@/src/modules/academy-admissions/domain/repositories/admission-review-history-reader";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "@/src/modules/academy-admissions/constants/admission-public-contract";

/** @returns Native authority and deliberately separate storage/public representations for one selected request. */
function fixture() {
  const tribeId = randomUUID(), admissionRequestId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), requestId = randomUUID();
  const context = { tribeId, userId, sessionId, requestId, role: "guardian" as const, membershipStatus: "active" as const, action: "read_review_history" as const, resourceId: admissionRequestId };
  const record = { id: randomUUID(), tribeId, admissionRequestId, eventType: "pending_created" as const, fromStatus: null, toStatus: "pending" as const, resourceVersion: 1, actorKind: "account" as const, createdAt: new Date("2026-10-16T01:00:00.123Z") };
  const cursor = `2026-10-16T01:00:00.123456Z${ADMISSION_REVIEW_CURSOR_SEPARATOR}${record.id}`;
  const resolver = { execute: vi.fn<ResolveAdmissionContextUseCase["execute"]>(async () => ({ allowed: true, context })) };
  const reader = { readHistory: vi.fn<AdmissionReviewHistoryReader["readHistory"]>(async () => ({ records: [record], nextCursor: cursor })) };
  const query = { tribeId, admissionRequestId, requestId, limit: 25 };
  return { resolver, reader, record, context, query, cursor, useCase: new GetAdmissionReviewHistoryUseCase(resolver, reader) };
}

describe("authorized request review history", () => {
  it("should deny before reading any private history when native review authority is unavailable", async () => {
    const data = fixture();
    data.resolver.execute.mockResolvedValueOnce({ allowed: false, failure: { code: "permission_denied" } });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.reader.readHistory).not.toHaveBeenCalled();
  });

  it("should publish only selected history facts with exact cursor and native account scope", async () => {
    const data = fixture();
    const privateRecord = { ...data.record, rawContact: "private-fixture@example.test", internalReason: "Private history fixture text" };
    data.reader.readHistory.mockResolvedValueOnce({ records: [privateRecord], nextCursor: data.cursor });
    const query = { ...data.query, cursor: { at: "2026-10-16T01:00:00.123457Z", id: randomUUID() }, userId: randomUUID() };
    const result = await data.useCase.execute(query);
    expect(result).toEqual({ ok: true, value: { tribeId: data.query.tribeId, admissionRequestId: data.query.admissionRequestId, items: [{ id: data.record.id, eventType: "pending_created", fromStatus: null, toStatus: "pending", resourceVersion: 1, actorKind: "account", createdAt: data.record.createdAt.toISOString() }], nextCursor: data.cursor } });
    expect(JSON.stringify(result)).not.toContain(privateRecord.rawContact);
    expect(JSON.stringify(result)).not.toContain(privateRecord.internalReason);
    expect(data.reader.readHistory).toHaveBeenCalledWith({ tribeId: data.context.tribeId, userId: data.context.userId, sessionId: data.context.sessionId, requestId: data.query.requestId }, data.query.admissionRequestId, expect.objectContaining({ limit: data.query.limit, cursor: expect.objectContaining({ at: "2026-10-16T01:00:00.123457Z" }) }));
    expect(data.resolver.execute).toHaveBeenCalledWith(expect.objectContaining({ action: "read_review_history", resource: { kind: "admission_request", id: data.query.admissionRequestId } }));
  });

  it("should preserve an authorized empty retained history without manufacturing an event", async () => {
    const data = fixture();
    data.reader.readHistory.mockResolvedValueOnce({ records: [], nextCursor: null });
    expect(await data.useCase.execute(data.query)).toEqual({ ok: true, value: { tribeId: data.query.tribeId, admissionRequestId: data.query.admissionRequestId, items: [], nextCursor: null } });
  });

  it("should keep an absent retained actor unattributed without claiming an automated action", async () => {
    const data = fixture();
    data.reader.readHistory.mockResolvedValueOnce({ records: [{ ...data.record, actorKind: "unattributed" }], nextCursor: null });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { items: [{ actorKind: "unattributed" }] } });
  });

  it("should discard returned history after native permission is revoked", async () => {
    const data = fixture();
    data.resolver.execute.mockResolvedValueOnce({ allowed: true, context: data.context }).mockResolvedValueOnce({ allowed: false, failure: { code: "permission_denied" } });
    const result = await data.useCase.execute(data.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(result).not.toHaveProperty("value");
  });

  it.each(["userId", "sessionId"] as const)("should close private output when native %s changes after reading", async (field) => {
    const data = fixture();
    data.resolver.execute.mockResolvedValueOnce({ allowed: true, context: data.context }).mockResolvedValueOnce({ allowed: true, context: { ...data.context, [field]: randomUUID() } });
    const result = await data.useCase.execute(data.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(result).not.toHaveProperty("value");
  });

  it.each(["tribeId", "admissionRequestId"] as const)("should reject a record whose %s differs from the selected native resource", async (field) => {
    const data = fixture();
    data.reader.readHistory.mockResolvedValueOnce({ records: [{ ...data.record, [field]: randomUUID() }], nextCursor: null });
    const result = await data.useCase.execute(data.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    expect(result).not.toHaveProperty("value");
  });

  it("should retain the original reader cause behind a closed failure without returning history", async () => {
    const data = fixture();
    const privateError = new Error("Private reader fixture diagnostic");
    data.reader.readHistory.mockRejectedValueOnce(privateError);
    const result = await data.useCase.execute(data.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
    if (result.ok) throw new Error("Unexpected successful history fixture");
    expect(result.failure.cause).toBe(privateError);
    expect(result).not.toHaveProperty("value");
  });
});
