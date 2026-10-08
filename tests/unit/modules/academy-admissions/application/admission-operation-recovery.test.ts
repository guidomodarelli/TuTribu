/** @vitest-environment node */
/** Exercises read-only original-operation recovery through actual application guards. @module admission-operation-recovery-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ReadAdmissionOperationUseCase } from "@/src/modules/academy-admissions/application/use-cases/read-admission-operation-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";

/** Supplies only own account/registry read ports; no claim or mutation dependency exists. */
function recoveryFixture() {
  const now = new Date("2026-10-07T00:00:00Z"), operationId = randomUUID(), tribeId = randomUUID();
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "applicant@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-08T00:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const registered = { operationType: "submit_admission", operation: { state: "completed", operationId, replayed: true, result: { operationId, outcome: "already_member", admissionRequestId: null, committedRequestVersion: null, membership: { role: "tribemate", status: "active" }, privateCiphertext: "synthetic-private" }, leaseOwner: randomUUID() } };
  const reader = { read: vi.fn(async (): Promise<unknown | null> => registered) };
  return { accounts, account, reader, registered, now, query: { tribeId, operationId, requestId: randomUUID() } };
}

describe("original admission operation read", () => {
  it.each(["applied", "denied"])("should recover the original proof attachment outcome: %s", async (outcome) => {
    const fixture = recoveryFixture();
    const snapshot = outcome === "applied" ? { outcome, requestId: randomUUID(), requestVersion: 2, status: "pending", proofId: randomUUID() } : { outcome, code: "proof_unavailable" };
    fixture.reader.read.mockResolvedValue({ operationType: "attach_admission_proof", operation: { state: "completed", operationId: fixture.query.operationId, replayed: true, result: snapshot } });
    expect(await new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query)).toEqual({ ok: true, value: { type: "attach_admission_proof", state: "completed", operationId: fixture.query.operationId, replayed: true, result: snapshot } });
  });
  it.each(["issue_contact_challenge", "resend_contact_challenge"])("should recover original %s with masked admission contact and no private transport material", async (operationType) => {
    const fixture = recoveryFixture();
    fixture.reader.read.mockResolvedValue({ operationType, operation: { state: "completed", operationId: fixture.query.operationId, replayed: true, result: { purpose: "admission", challengeId: randomUUID(), channel: "email", maskedDestination: "a•••@example.test", expiresAt: "2026-10-07T00:10:00Z", resendAllowedAt: "2026-10-07T00:01:00Z", deliveryState: "queued", codeEnvelope: "synthetic-private", destination: fixture.account.normalizedEmail } } });
    const result = await new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query);
    expect(result).toMatchObject({ ok: true, value: { type: operationType, state: "completed", operationId: fixture.query.operationId, replayed: true, result: { purpose: "admission", deliveryState: "queued" } } });
    if (result.ok) { expect(result.value).not.toHaveProperty("result.codeEnvelope"); expect(result.value).not.toHaveProperty("result.destination"); }
    fixture.reader.read.mockResolvedValueOnce({ operationType, operation: { state: "started", operationId: fixture.query.operationId } });
    expect(await new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query)).toMatchObject({ ok: true, value: { type: operationType, state: "started" } });
  });

  it.each([
    { purpose: "admission", result: "verified", proofId: randomUUID(), applyBefore: "2026-10-07T00:15:00Z" },
    { purpose: "admission", result: "denied", code: "verification_code_incorrect" },
  ])("should recover committed local verification without converting its outcome or repeating accounting: $result", async (snapshot) => {
    const fixture = recoveryFixture();
    fixture.reader.read.mockResolvedValue({ operationType: "verify_contact_challenge", operation: { state: "completed", operationId: fixture.query.operationId, replayed: true, result: snapshot } });
    expect(await new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query)).toEqual({ ok: true, value: { type: "verify_contact_challenge", state: "completed", operationId: fixture.query.operationId, replayed: true, result: snapshot } });
    expect(fixture.reader.read).toHaveBeenCalledTimes(1);
  });

  it("should reject diagnostic proof purpose before exposing a contact verification recovery result", async () => {
    const fixture = recoveryFixture();
    fixture.reader.read.mockResolvedValue({ operationType: "verify_contact_challenge", operation: { state: "completed", operationId: fixture.query.operationId, replayed: true, result: { purpose: "connection_diagnostic", result: "verified", diagnosticId: randomUUID(), connectionVersion: 1, channel: "email" } } });
    expect(await new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it.each(["initialize_admission_policy", "update_admission_policy", "activate_admission_policy", "pause_admission_policy"])("should recover the original %s without recency or current policy reconstruction", async (operationType) => {
    const fixture = recoveryFixture();
    const activated = operationType === "activate_admission_policy";
    fixture.reader.read.mockResolvedValue({ operationType, operation: { state: "completed", operationId: fixture.query.operationId, replayed: true, result: { policyId: fixture.query.tribeId, version: 1, verificationEpoch: 1, activatedAt: activated ? "2026-10-06T23:00:00Z" : null, controlActivated: activated, changed: true, privateKeyId: "synthetic-private" } } });
    const result = await new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query);
    expect(result).toMatchObject({ ok: true, value: { type: operationType, state: "completed", replayed: true, result: { version: 1, controlActivated: activated } } });
    if (result.ok) expect(result.value).not.toHaveProperty("result.privateKeyId");
    expect(fixture.account.recentAuthentication).toEqual([]);
    fixture.reader.read.mockResolvedValueOnce({ operationType, operation: { state: "started", operationId: fixture.query.operationId } });
    expect(await new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query)).toMatchObject({ ok: true, value: { type: operationType, state: "started" } });
  });

  it("should reject foreign policy scope, activation without protection and initialization with non-default effective counters", async () => {
    const fixture = recoveryFixture(), useCase = new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    const result = { policyId: fixture.query.tribeId, version: 1, verificationEpoch: 1, activatedAt: null, controlActivated: false, changed: true };
    for (const [operationType, incorrect] of [["update_admission_policy", { ...result, policyId: randomUUID() }], ["activate_admission_policy", result], ["initialize_admission_policy", { ...result, version: 2 }]] as const) {
      fixture.reader.read.mockResolvedValueOnce({ operationType, operation: { state: "completed", operationId: fixture.query.operationId, replayed: true, result: incorrect } });
      expect(await useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    }
  });
  it("should recover only the original actor namespace and return an allowlisted historical result", async () => {
    const fixture = recoveryFixture();
    const result = await new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now).execute(fixture.query);
    expect(result).toMatchObject({ ok: true, value: { type: "submit_admission", state: "completed", operationId: fixture.query.operationId, replayed: true, result: { outcome: "already_member" } } });
    expect(fixture.reader.read).toHaveBeenCalledWith({ userId: fixture.account.userId, sessionId: fixture.account.session.id, tribeId: fixture.query.tribeId, requestId: fixture.query.requestId }, fixture.query.operationId);
    if (result.ok) { expect(result.value).not.toHaveProperty("leaseOwner"); expect(result.value).not.toHaveProperty("result.privateCiphertext"); }
  });

  it("should represent absence without manufacturing a started operation and reject a mismatched registered id", async () => {
    const fixture = recoveryFixture(), useCase = new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    fixture.reader.read.mockResolvedValueOnce(null);
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
    fixture.reader.read.mockResolvedValueOnce({ ...fixture.registered, operation: { state: "started", operationId: randomUUID() } });
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should reject absent and changed sessions before returning any registry result", async () => {
    const fixture = recoveryFixture(), useCase = new ReadAdmissionOperationUseCase(fixture.accounts, fixture.reader, () => fixture.now);
    fixture.accounts.getAuthenticatedAccount.mockResolvedValueOnce(null);
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(fixture.reader.read).not.toHaveBeenCalled();
    fixture.accounts.getAuthenticatedAccount.mockResolvedValueOnce(fixture.account).mockResolvedValueOnce({ ...fixture.account, session: { ...fixture.account.session, id: randomUUID() } });
    expect(await useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });
});
