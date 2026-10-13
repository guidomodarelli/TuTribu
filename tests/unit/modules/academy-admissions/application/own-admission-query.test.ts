/** @vitest-environment node */
/** Exercises current own-query authority and the real allowlisted application DTO. @module own-admission-query-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { GetOwnAdmissionUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-own-admission-use-cases";

/** Own reader ports do not grant membership, materialize expiration or create operations. */
function ownQuery() {
  const now = new Date("2026-10-06T12:00:00Z");
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "applicant@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-07T12:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const request = { id: randomUUID(), status: "pending", version: 1, submittedAt: now.toISOString(), expiresAt: "2026-11-05T12:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "declared" }, internalReason: "Synthetic reviewer-only reason", secretReference: randomUUID() };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const reader = { readOwn: vi.fn(async (): Promise<unknown | null> => request) };
  return { accounts, account, reader, request, now, query: { tribeId: randomUUID(), requestId: randomUUID() } };
}

describe("own admission application query", () => {
  it("should reject a reader that substitutes the latest request for the explicit historical own request", async () => {
    const fixture = ownQuery();
    const admissionRequestId = randomUUID();
    expect(await new GetOwnAdmissionUseCases(fixture.accounts, fixture.reader, () => fixture.now).getOwn({ ...fixture.query, admissionRequestId })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    fixture.reader.readOwn.mockResolvedValueOnce({ ...fixture.request, id: admissionRequestId });
    expect(await new GetOwnAdmissionUseCases(fixture.accounts, fixture.reader, () => fixture.now).getOwn({ ...fixture.query, admissionRequestId })).toMatchObject({ ok: true, value: { id: admissionRequestId } });
  });

  it("should query an authenticated nonmember and return only its validated own DTO without reviewer detail", async () => {
    const fixture = ownQuery();
    const result = await new GetOwnAdmissionUseCases(fixture.accounts, fixture.reader, () => fixture.now).getOwn(fixture.query);
    expect(result).toMatchObject({ ok: true, value: { status: "pending", version: 1, contact: { evidenceKind: "declared" } } });
    if (result.ok && result.value) { expect(result.value).not.toHaveProperty("internalReason"); expect(result.value).not.toHaveProperty("secretReference"); }
    expect(fixture.reader.readOwn).toHaveBeenCalledWith({ ...fixture.query, userId: fixture.account.userId, sessionId: fixture.account.session.id });
  });

  it("should preserve absence without a resource version or durable operation", async () => {
    const fixture = ownQuery();
    fixture.reader.readOwn.mockResolvedValueOnce(null);
    expect(await new GetOwnAdmissionUseCases(fixture.accounts, fixture.reader, () => fixture.now).getOwn(fixture.query)).toEqual({ ok: true, value: null });
  });

  it("should reject absent session before the reader and a changed session after its wait", async () => {
    const fixture = ownQuery(), useCases = new GetOwnAdmissionUseCases(fixture.accounts, fixture.reader, () => fixture.now);
    fixture.accounts.getAuthenticatedAccount.mockResolvedValueOnce(null);
    expect(await useCases.getOwn(fixture.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(fixture.reader.readOwn).not.toHaveBeenCalled();
    fixture.accounts.getAuthenticatedAccount.mockResolvedValueOnce(fixture.account).mockResolvedValueOnce({ ...fixture.account, session: { ...fixture.account.session, id: randomUUID() } });
    expect(await useCases.getOwn(fixture.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });

  it("should reject an unusable own DTO with a closed failure and never invent started work", async () => {
    const fixture = ownQuery();
    fixture.reader.readOwn.mockResolvedValueOnce({ ...fixture.request, version: 0 });
    const result = await new GetOwnAdmissionUseCases(fixture.accounts, fixture.reader, () => fixture.now).getOwn(fixture.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    if (!result.ok) expect(result.failure.operation).toBeUndefined();
  });
});
