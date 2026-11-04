/** @vitest-environment node */
/** Exercises the definitive platform denial of sensitive messaging operations, before any prepare, provider call or write. @module messaging-platform-security-denial-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ResolveMessagingContextUseCase, ResolveMessagingWriteContextUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-context-use-case";
import type { MessagingAuthenticatedAccount, MessagingConnectionAuthorizationFacts, MessagingLeadershipFacts, MessagingOriginalOperation, MessagingOriginalOperationLookup, MessagingSecurityFactsProvider } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { ActivateMessagingConnectionUseCase } from "@/src/modules/messaging/application/use-cases/activate-messaging-connection-use-case";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
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

/** @param security - Live security facts port under test. @param originals - Ledger lookup port of the write composition, when the test exercises it. @returns A resolver whose account, leadership and connection ports describe a current leader and usable candidate. */
function resolverWith(security: MessagingSecurityFactsProvider, originals?: MessagingOriginalOperationLookup) {
  const now = new Date("2026-10-05T12:00:00.000Z"), tribeId = randomUUID(), connectionId = randomUUID(), userId = randomUUID();
  const account: MessagingAuthenticatedAccount = { userId, session: { id: randomUUID(), expiresAt: new Date(now.getTime() + 3_600_000) }, googleAccount: { id: randomUUID(), subject: randomUUID() } };
  const leadership: MessagingLeadershipFacts = { tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } };
  const connection: MessagingConnectionAuthorizationFacts = { id: connectionId, tribeId, version: 1, contributedByUserId: userId, state: "ready", environment, securityEpoch, retiredAt: null, secretRef: randomUUID() };
  const accounts = { getAuthenticatedAccount: async () => account };
  const sensitive = new ResolveMessagingContextUseCase(accounts, { getCurrentLeadership: async () => leadership, getConnection: async () => connection }, security, () => now);
  const resolver = originals ? new ResolveMessagingWriteContextUseCase(sensitive, accounts, originals) : sensitive;
  return { resolver, userId, command: { tribeId, connectionId, operation: "configure_messaging_connection", requestId: randomUUID() } };
}

/** @returns An in-memory ledger lookup double: the originals it holds and every lookup it answered. */
function inMemoryLedger() {
  const registered: MessagingOriginalOperation[] = [], lookups: MessagingOriginalOperation[] = [];
  const lookup: MessagingOriginalOperationLookup = {
    isRegistered: async (original) => {
      lookups.push(original);
      return registered.some((entry) => entry.actorUserId === original.actorUserId && entry.tribeId === original.tribeId && entry.operation === original.operation && entry.operationId === original.operationId);
    },
  };
  return { lookup, lookups, register: (original: MessagingOriginalOperation) => { registered.push(original); } };
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

describe("platform denial of an original that may already be registered", () => {
  const locked: MessagingSecurityFactsProvider = { getCurrentSecurityFacts: async () => ({ environment, securityEpoch, recoveryLocked: true }) };
  const unconfigured: MessagingSecurityFactsProvider = { getCurrentSecurityFacts: () => readMessagingPlatformSecurityFacts(() => readMessagingHostingSecurityConfig({})) };

  it.each([["locked", locked], ["unconfigured", unconfigured]] as const)("should keep an already registered original unresolved under its operation id when the platform is %s", async (_state, security) => {
    const operationId = randomUUID(), ledger = inMemoryLedger();
    const { resolver, command, userId } = resolverWith(security, ledger.lookup);
    ledger.register({ actorUserId: userId, tribeId: command.tribeId, operation: command.operation, operationId });
    const outcome = await resolver.execute({ ...command, operationId });
    expect(outcome).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.operationUnresolved, operation: { operationId, state: "started" } } });
    if (outcome.allowed) throw new Error("Expected an unresolved original");
    expect(outcome.failure.cause).toBeInstanceOf(MessagingPlatformSecurityError);
    expect(ledger.lookups).toEqual([{ actorUserId: userId, tribeId: command.tribeId, operation: command.operation, operationId }]);
  });

  it("should reject a new original definitively, with no operation to recover", async () => {
    const ledger = inMemoryLedger();
    const { resolver, command, userId } = resolverWith(locked, ledger.lookup);
    ledger.register({ actorUserId: userId, tribeId: command.tribeId, operation: REAUTHENTICATION_OPERATION.activateMessagingConnection, operationId: randomUUID() });
    const outcome = await resolver.execute({ ...command, operationId: randomUUID() });
    expect(outcome).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.platformSecurityUnavailable } });
    if (outcome.allowed) throw new Error("Expected a platform denial");
    expect(outcome.failure.operation).toBeUndefined();
    expect(outcome.failure.cause).toMatchObject({ requirement: "recovery_locked" });
    expect(ledger.lookups).toHaveLength(1);
  });

  it("should keep the original unresolved when its registration cannot be checked", async () => {
    const operationId = randomUUID(), lookupFailure = new Error("Synthetic ledger lookup failure");
    const { resolver, command } = resolverWith(unconfigured, { isRegistered: async () => { throw lookupFailure; } });
    const outcome = await resolver.execute({ ...command, operationId });
    expect(outcome).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.operationUnresolved, operation: { operationId, state: "started" } } });
    if (outcome.allowed) throw new Error("Expected an unresolved original");
    expect(outcome.failure.cause).toBeInstanceOf(AggregateError);
    expect(outcome.failure.cause).toMatchObject({ errors: [expect.any(MessagingPlatformSecurityError), lookupFailure] });
  });

  it("should deny a read, which names no original, definitively without looking up the ledger", async () => {
    const ledger = inMemoryLedger();
    const { resolver, command } = resolverWith(locked, ledger.lookup);
    expect(await resolver.execute(command)).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.platformSecurityUnavailable } });
    expect(ledger.lookups).toEqual([]);
  });

  it("should answer a resent activation whose original already committed as unresolved, and a new one as a definitive refusal, without reaching the activator", async () => {
    const operationId = randomUUID(), ledger = inMemoryLedger(), activations: unknown[] = [];
    const { resolver, command, userId } = resolverWith(locked, ledger.lookup);
    ledger.register({ actorUserId: userId, tribeId: command.tribeId, operation: REAUTHENTICATION_OPERATION.activateMessagingConnection, operationId });
    const activation = new ActivateMessagingConnectionUseCase(resolver, { activate: async (...input) => { activations.push(input); throw new Error("The activator must not run without platform security"); } });
    const scope = { tribeId: command.tribeId, connectionId: command.connectionId, requestId: command.requestId, expectedVersion: 1, confirmed: true as const };
    const resent = await activation.execute({ ...scope, operationId });
    expect(resent).toMatchObject({ ok: false, failure: { code: MESSAGING_ERROR_CODE.operationUnresolved, operation: { operationId, state: "started" } } });
    expect(MESSAGING_ERROR_HTTP_STATUS[MESSAGING_ERROR_CODE.operationUnresolved]).toBe(HTTP_STATUS.accepted);
    expect(await activation.execute({ ...scope, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: MESSAGING_ERROR_CODE.platformSecurityUnavailable } });
    expect(activations).toEqual([]);
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
