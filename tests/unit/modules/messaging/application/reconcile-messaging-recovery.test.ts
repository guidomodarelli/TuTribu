/** Exercises the private recovery command boundary without a platform or persistence mock. @module reconcile-messaging-recovery-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ReconcileMessagingRecoveryUseCase } from "@/src/modules/messaging/application/use-cases/reconcile-messaging-recovery-use-case";
import type { MessagingRecovery, MessagingRecoveryCommand } from "@/src/modules/messaging/domain/repositories/messaging-recovery";

/** @returns One operator-owned source/current epoch pair; it is never inferred from restored rows. */
function command() { return { tribeId: randomUUID(), environment: randomUUID(), securityEpoch: randomUUID(), sourceSecurityEpoch: randomUUID() }; }
/** @returns An explicit own port and its calls; no database, crypto or SDK is replaced. */
function recoveryPort() {
  const reconciliations: MessagingRecoveryCommand[] = [], inspections: MessagingRecoveryCommand[] = [];
  const result = { policyClosed: false, connectionsSuspended: 0, candidateSlotsReleased: 0, versionsRetired: 0, secretsRetired: 0, proofsInvalidated: 0, challengesInvalidated: 0, queuedDeliveriesCancelled: 0, remaining: true };
  const recovery: MessagingRecovery = {
    async reconcile(input) { reconciliations.push(input); return result; },
    async inspect(input) { inspections.push(input); return { remaining: true }; },
  };
  return { recovery, reconciliations, inspections, result };
}

describe("private messaging recovery command", () => {
  it("should preserve confirmed partial progress without scheduling another batch or releasing recovery", async () => {
    // Arrange
    const port = recoveryPort(), useCase = new ReconcileMessagingRecoveryUseCase(port.recovery), input = command();
    // Act
    const result = await useCase.execute(input);
    // Assert
    expect(result).toBe(port.result);
    expect(port.reconciliations).toEqual([{ ...input, limit: 25 }]);
    expect(port.inspections).toEqual([]);
  });

  it("should reject invalid scope, unchanged epoch and invalid bounds before private effects", async () => {
    const port = recoveryPort(), useCase = new ReconcileMessagingRecoveryUseCase(port.recovery), input = command();
    for (const patch of [{ tribeId: "invalid" }, { environment: " " }, { securityEpoch: " " }, { sourceSecurityEpoch: " " }, { sourceSecurityEpoch: input.securityEpoch }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }]) {
      await expect(useCase.execute({ ...input, ...patch })).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(port.reconciliations).toEqual([]);
  });

  it("should inspect the current scope without starting or repeating reconciliation", async () => {
    const port = recoveryPort(), useCase = new ReconcileMessagingRecoveryUseCase(port.recovery), input = command();
    expect(await useCase.inspect(input)).toEqual({ remaining: true });
    expect(port.inspections).toEqual([{ ...input, limit: 25 }]);
    expect(port.reconciliations).toEqual([]);
  });

  it("should preserve an unconfirmed original failure and never retry or invent confirmed counts", async () => {
    const port = recoveryPort(), failure = new Error("Synthetic unconfirmed recovery commit");
    let calls = 0;
    port.recovery.reconcile = async () => { calls += 1; throw failure; };
    await expect(new ReconcileMessagingRecoveryUseCase(port.recovery).execute(command())).rejects.toBe(failure);
    expect(calls).toBe(1);
    expect(port.inspections).toEqual([]);
  });
});
