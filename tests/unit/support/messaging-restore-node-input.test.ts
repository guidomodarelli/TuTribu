/** @vitest-environment node */
/** Validates the own private phase DTO; no provider, database, SDK or platform library is mocked. */
import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { messagingRestoreNodeInputSchema, MESSAGING_RESTORE_NODE_HOST as HOST } from "@/tests/support/constants/messaging-restore-node-host";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { REAUTHENTICATION_OPERATION as OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { VERIFICATION_CODE_GENERATION } from "@/src/modules/academy-admissions/constants/verification-challenge";

/** @returns One coherent synthetic transport object with ephemeral identifiers and no reusable credentials. */
function phaseInput() {
  const tribeId = randomUUID(), connectionId = randomUUID(), securityEpoch = randomUUID();
  const common = { actorUserId: randomUUID(), sessionId: randomUUID(), tribeId, requestId: randomUUID(), accountId: randomUUID(), subject: randomUUID(), resourceId: connectionId };
  const authorized = { ...common, authorizationPurpose: "sensitive_leader", connectionId, connectionVersion: 1, environment: HOST.securityEnvironment, securityEpoch, secretRef: randomUUID() };
  const applicant = () => { const userId = randomUUID(); return { context: { userId, sessionId: randomUUID(), tribeId, requestId: randomUUID(), purpose: "admission" }, contact: { type: "email", value: `${userId}@example.test` } }; };
  const history = ["selected", "fresh", "expired", "late", "selected_with_candidate"].map((name) => ({ name, tribeId: randomUUID(), connectionId: randomUUID(), candidateVersion: 1, selectedVersion: null }));
  return {
    operationId: randomUUID(), cohortId: randomUUID(), phase: "baseline",
    expected: { environment: HOST.securityEnvironment, securityEpoch, recoveryLocked: false },
    source: {
      context: { ...authorized, operation: OPERATION.readMessagingSenders }, activationContext: { ...authorized, operation: OPERATION.activateMessagingConnection }, retirementContext: { ...authorized, operation: OPERATION.disconnectMessagingConnection }, creationContext: { ...common, resourceId: tribeId, operation: OPERATION.saveMessagingCredentials },
      ownEmail: `${common.actorUserId}@example.test`, originalCredential: randomUUID(), originalKeyIds: Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => [purpose, randomUUID()])), activatedVersion: 1, policyVersion: 1, nonBypassRoleName: `admission_test_${randomUUID().replaceAll("-", "")}`,
      applied: { ...applicant(), proofId: randomUUID(), requestId: randomUUID(), requestVersion: 1, applyBefore: new Date().toISOString() }, available: { ...applicant(), proofId: randomUUID(), applyBefore: new Date().toISOString() },
      queued: { ...applicant(), original: { challengeId: randomUUID(), deliveryId: randomUUID() }, code: String(randomInt(VERIFICATION_CODE_GENERATION.decimalRange)).padStart(6, "0"), expiresAt: new Date().toISOString() }, uncertainDeliveryId: randomUUID(), manualTribeId: history[0].tribeId, history,
    },
  };
}

describe("private native restore input", () => {
  it("adapts serialized dates while retaining the exact fixture scope", () => {
    const input = phaseInput(), parsed = messagingRestoreNodeInputSchema.parse(input);
    expect(parsed.source.applied.applyBefore).toBeInstanceOf(Date);
    expect(parsed.source.context.connectionId).toBe(input.source.context.connectionId);
    expect(parsed.source.history).toHaveLength(HOST.historyCaseCount);
  });

  it("rejects retired recent-authentication fields in an authority context", () => {
    const input = phaseInput();
    expect(messagingRestoreNodeInputSchema.safeParse({ ...input, source: { ...input.source, context: { ...input.source.context, authenticatedAt: new Date().toISOString() } } }).success).toBe(false);
  });

  it("rejects authority from a different account even when every identifier is individually valid", () => {
    const input = phaseInput(); input.source.activationContext.actorUserId = randomUUID();
    expect(messagingRestoreNodeInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a different resource reference and an incomplete historical inventory", () => {
    const input = phaseInput(); input.source.retirementContext.resourceId = randomUUID();
    expect(messagingRestoreNodeInputSchema.safeParse(input).success).toBe(false);
    const missing = phaseInput(); missing.source.history.pop();
    expect(messagingRestoreNodeInputSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects an unlocked control profile in the isolated lock phase", () => {
    const input = { ...phaseInput(), phase: "locked_original" };
    expect(messagingRestoreNodeInputSchema.safeParse(input).success).toBe(false);
    input.expected.recoveryLocked = true;
    expect(messagingRestoreNodeInputSchema.safeParse(input).success).toBe(true);
  });

  it("does not accept an extra private field outside its explicit transport contract", () => {
    expect(messagingRestoreNodeInputSchema.safeParse({ ...phaseInput(), unmanagedSecret: randomUUID() }).success).toBe(false);
  });
});
