/** @vitest-environment node */
/** Exercises original email settings recovery through the existing readonly admission registry owner. @module admission-email-settings-recovery-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ReadAdmissionOperationUseCase } from "@/src/modules/academy-admissions/application/use-cases/read-admission-operation-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** @returns A genuine readonly use case with controlled owned account/registry ports, not SDK or SQL doubles. */
function fixture() {
  const tribeId = randomUUID(), operationId = randomUUID(), now = new Date("2026-10-15T20:00:00Z");
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "recovery@example.invalid", session: { id: randomUUID(), expiresAt: new Date("2026-10-15T21:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const stored = { operationType: "update_admission_email_settings", operation: { state: "completed", operationId, replayed: true, result: { status: "changed", settings: { tribeId, enabled: true, version: 1, enabledAtMicroseconds: 1792090800123456, timeZone: "Asia/Kolkata" } } } };
  const accounts = { getAuthenticatedAccount: vi.fn(async () => account) };
  const reader = { read: vi.fn(async (): Promise<unknown | null> => stored) };
  return { account, accounts, reader, stored, query: { tribeId, operationId, requestId: randomUUID() }, useCase: new ReadAdmissionOperationUseCase(accounts, reader, () => now) };
}

describe("original independent email settings recovery", () => {
  // Reading a committed original is metadata recovery, without a new Google confirmation or another write.
  it("should recover the historical minimal settings when recent Google evidence is absent", async () => {
    const data = fixture();

    const result = await data.useCase.execute(data.query);

    expect(result).toEqual({ ok: true, value: { type: "update_admission_email_settings", state: "completed", operationId: data.query.operationId, replayed: true, result: { status: "changed", settings: { enabled: true, version: 1, timeZone: "Asia/Kolkata" } } } });
    expect(data.reader.read).toHaveBeenCalledWith({ userId: data.account.userId, sessionId: data.account.session.id, tribeId: data.query.tribeId, requestId: data.query.requestId }, data.query.operationId);
    expect(JSON.stringify(result)).not.toContain("enabledAtMicroseconds");
    expect(JSON.stringify(result)).not.toContain(data.query.tribeId);
  });

  it("should retain registered progress when an original settings operation is still started", async () => {
    const data = fixture();
    data.reader.read.mockResolvedValue({ operationType: "update_admission_email_settings", operation: { state: "started", operationId: data.query.operationId } });

    expect(await data.useCase.execute(data.query)).toEqual({ ok: true, value: { type: "update_admission_email_settings", state: "started", operationId: data.query.operationId } });
  });

  it("should retain an original terminal rejection when current readiness may have changed", async () => {
    const data = fixture();
    data.reader.read.mockResolvedValue({ operationType: "update_admission_email_settings", operation: { state: "completed", operationId: data.query.operationId, replayed: true, result: { status: "rejected", reason: "email_capability_unavailable" } } });

    expect(await data.useCase.execute(data.query)).toEqual({ ok: true, value: { type: "update_admission_email_settings", state: "completed", operationId: data.query.operationId, replayed: true, result: { status: "rejected", reason: "email_capability_unavailable" } } });
  });

  it("should reject an unusable foreign settings result before it can cross the public recovery boundary", async () => {
    const data = fixture();
    data.stored.operation.result.settings.tribeId = randomUUID();

    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should keep absence and current permission loss separate from a recoverable original", async () => {
    const data = fixture();
    data.reader.read.mockResolvedValueOnce(null).mockRejectedValueOnce(new AdmissionOperationError("permission_denied"));

    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
  });
});
