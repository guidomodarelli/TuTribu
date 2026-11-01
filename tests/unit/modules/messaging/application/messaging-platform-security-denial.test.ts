/** @vitest-environment node */
/** Exercises the definitive platform denial of sensitive messaging operations, before any prepare, provider call or write. @module messaging-platform-security-denial-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ResolveMessagingContextUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-context-use-case";
import type { MessagingAuthenticatedAccount, MessagingConnectionAuthorizationFacts, MessagingLeadershipFacts, MessagingSecurityFactsProvider } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingPlatformSecurityError } from "@/src/modules/messaging/domain/errors/messaging-platform-security-error";
import { readMessagingPlatformSecurityFacts } from "@/src/modules/messaging/infrastructure/config/messaging-platform-security-facts";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { knownConnectionFailureCode } from "@/src/modules/messaging/infrastructure/repositories/messaging-operation-failure-code";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_ERROR_HTTP_STATUS } from "@/src/modules/messaging/infrastructure/api/messaging-error-status";
import { HTTP_STATUS } from "@/src/constants/http-status";

const environment = "synthetic-local", securityEpoch = "epoch-a";

/** @param security - Live security facts port under test. @returns A resolver whose account, leadership and connection ports describe a current leader and usable candidate. */
function resolverWith(security: MessagingSecurityFactsProvider) {
  const now = new Date("2026-10-05T12:00:00.000Z"), tribeId = randomUUID(), connectionId = randomUUID(), userId = randomUUID();
  const account: MessagingAuthenticatedAccount = { userId, session: { id: randomUUID(), expiresAt: new Date(now.getTime() + 3_600_000) }, googleAccount: { id: randomUUID(), subject: randomUUID() } };
  const leadership: MessagingLeadershipFacts = { tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } };
  const connection: MessagingConnectionAuthorizationFacts = { id: connectionId, tribeId, version: 1, contributedByUserId: userId, state: "ready", environment, securityEpoch, retiredAt: null, secretRef: randomUUID() };
  const resolver = new ResolveMessagingContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentLeadership: async () => leadership, getConnection: async () => connection }, security, () => now);
  return { resolver, command: { tribeId, connectionId, operation: "configure_messaging_connection", requestId: randomUUID() } };
}

describe("platform denial of sensitive messaging operations", () => {
  it("should deny with the definitive platform code, keeping the typed hosting failure as cause, when the hosting security cannot be read", async () => {
    const { resolver, command } = resolverWith({ getCurrentSecurityFacts: () => readMessagingPlatformSecurityFacts(() => readMessagingHostingSecurityConfig({})) });
    const outcome = await resolver.execute(command);
    expect(outcome).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.platformSecurityUnavailable } });
    if (outcome.allowed) throw new Error("Expected a platform denial");
    expect(outcome.failure.cause).toBeInstanceOf(MessagingPlatformSecurityError);
    expect(outcome.failure.cause).toMatchObject({ requirement: "security_unconfigured", cause: { code: MESSAGING_CRYPTO_ERROR.invalidConfiguration } });
    expect(MESSAGING_ERROR_HTTP_STATUS[outcome.failure.code]).toBe(HTTP_STATUS.conflict);
  });

  it("should deny a locked platform with the platform code and keep a connection sealed under another epoch as incomplete", async () => {
    const locked = resolverWith({ getCurrentSecurityFacts: async () => ({ environment, securityEpoch, recoveryLocked: true }) });
    expect(await locked.resolver.execute(locked.command)).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.platformSecurityUnavailable } });
    const rotated = resolverWith({ getCurrentSecurityFacts: async () => ({ environment, securityEpoch: "epoch-b", recoveryLocked: false }) });
    expect(await rotated.resolver.execute(rotated.command)).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.connectionIncomplete } });
    const current = resolverWith({ getCurrentSecurityFacts: async () => ({ environment, securityEpoch, recoveryLocked: false }) });
    expect(await current.resolver.execute(current.command)).toMatchObject({ allowed: true });
  });

  it("should let a failure that is not a platform requirement escape unchanged", async () => {
    const unexpected = new Error("Synthetic hosting reader failure");
    await expect(readMessagingPlatformSecurityFacts(async () => { throw unexpected; })).rejects.toBe(unexpected);
    await expect(readMessagingPlatformSecurityFacts(async () => { throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch); })).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.contextMismatch });
  });
});

describe("connection failure codes", () => {
  it.each([MESSAGING_CRYPTO_ERROR.invalidConfiguration, MESSAGING_CRYPTO_ERROR.keyContinuityUnproven, MESSAGING_CRYPTO_ERROR.keyUnavailable, MESSAGING_CRYPTO_ERROR.recoveryLocked])("should classify the hosting failure %s as a platform requirement instead of an incomplete connection", (code) => {
    expect(knownConnectionFailureCode(new MessagingCryptographyError(code))).toBe(MESSAGING_ERROR_CODE.platformSecurityUnavailable);
  });

  it("should keep every other sealing failure as an incomplete connection and pass ledger codes through", () => {
    expect(knownConnectionFailureCode(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch))).toBe(MESSAGING_ERROR_CODE.connectionIncomplete);
    expect(knownConnectionFailureCode(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.authenticationFailed))).toBe(MESSAGING_ERROR_CODE.connectionIncomplete);
    expect(knownConnectionFailureCode(new AdmissionOperationError(MESSAGING_ERROR_CODE.platformSecurityUnavailable))).toBe(MESSAGING_ERROR_CODE.platformSecurityUnavailable);
    expect(knownConnectionFailureCode(new MessagingPlatformSecurityError("recovery_locked"))).toBe(MESSAGING_ERROR_CODE.platformSecurityUnavailable);
    expect(knownConnectionFailureCode(new Error("Synthetic unknown failure"))).toBe(MESSAGING_ERROR_CODE.unexpectedFailure);
  });
});
