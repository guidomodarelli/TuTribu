/** Exercises server-owned identity and exact proposal selection without any issuance or provider port. @module read-current-admission-challenge-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ReadCurrentAdmissionChallengeUseCase } from "@/src/modules/academy-admissions/application/use-cases/read-current-admission-challenge-use-case";
import type { AdmissionCurrentChallengeReader } from "@/src/modules/academy-admissions/domain/repositories/admission-current-challenge-reader";

/** @returns Own account/reader ports and minimal safe selection metadata. */
function fixture() {
  const now = new Date(), userId = randomUUID(), sessionId = randomUUID(), tribeId = randomUUID();
  const account = { userId, normalizedEmail: " Person+retry@gmail.com ", session: { id: sessionId, expiresAt: new Date(now.getTime() + 3_600_000) }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const current = { requiresReplacement: true, operationId: randomUUID(), challenge: { challengeId: randomUUID(), purpose: "admission" as const, channel: "email" as const, maskedDestination: "p•••@gmail.com", expiresAt: new Date(now.getTime() + 600_000).toISOString(), resendAllowedAt: new Date(now.getTime() + 60_000).toISOString(), deliveryState: "queued" as const } };
  const accounts = { getAuthenticatedAccount: vi.fn(async () => account) }, reader = { readCurrent: vi.fn(async () => ({ current })) };
  const input = { tribeId, requestId: randomUUID(), previousRequestId: randomUUID(), expectedPolicyVersion: 2, channel: "email" as const };
  return { now, account, current, accounts, reader, input, useCase: new ReadCurrentAdmissionChallengeUseCase(accounts, reader, () => now) };
}

describe("current challenge selection", () => {
  it("should retain the server-authorized SMS current code for a phone whose primary proposal is WhatsApp", async () => {
    const data = fixture(), current = { ...data.current, challenge: { ...data.current.challenge, channel: "sms" as const, maskedDestination: "••••1234" } };
    const reader: AdmissionCurrentChallengeReader = { readCurrent: async () => ({ current }) };
    const useCase = new ReadCurrentAdmissionChallengeUseCase(data.accounts, reader, () => data.now);
    expect(await useCase.execute({ ...data.input, channel: "whatsapp", phone: "+5491155501234", country: "AR" })).toMatchObject({ ok: true, value: { current } });
    expect(await useCase.execute(data.input)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should derive the contact and actor from the server and expose only its own minimal result", async () => {
    const data = fixture();
    expect(await data.useCase.execute(data.input)).toEqual({ ok: true, value: { current: data.current } });
    expect(data.reader.readCurrent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId: data.account.userId, sessionId: data.account.session.id, tribeId: data.input.tribeId, purpose: "admission", previousRequestId: data.input.previousRequestId, contact: { type: "email", value: "person+retry@gmail.com" } }));
  });

  it("should reject an expired native session before consulting a current challenge", async () => {
    const data = fixture();
    data.account.session.expiresAt = data.now;
    expect(await data.useCase.execute(data.input)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(data.reader.readCurrent).not.toHaveBeenCalled();
  });

  it("should normalize an explicit phone and reject a channel incompatible with its contact", async () => {
    const data = fixture();
    expect(await data.useCase.execute({ ...data.input, channel: "email", phone: "+5491155501234", country: "AR" })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(data.reader.readCurrent).not.toHaveBeenCalled();
  });

  it("should reject an unusable own result without revealing private reader fields", async () => {
    const data = fixture();
    data.reader.readCurrent.mockResolvedValue({ current: { ...data.current, challenge: { ...data.current.challenge, maskedDestination: "private@example.test" } } });
    expect(await data.useCase.execute(data.input)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
});
