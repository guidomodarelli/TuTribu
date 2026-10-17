/** Exercises actual private recovery composition before checkout without mocking SQL or internal SDKs. @module messaging-recovery-gate-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildMessagingRecoveryModule } from "@/src/modules/messaging/setup";
import type { MessagingSecurityFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** @returns Operator-selected source/replacement facts, a closed native executor boundary and observable checkout counts. */
function fixture() {
  const input = { tribeId: randomUUID(), environment: randomUUID(), securityEpoch: randomUUID(), sourceSecurityEpoch: randomUUID() };
  let facts: MessagingSecurityFacts = { environment: input.environment, securityEpoch: input.securityEpoch, recoveryLocked: true }, allowed = true, checkouts = 0, factReads = 0;
  const checkoutFailure = new Error("Synthetic private recovery checkout unavailable");
  const recovery = buildMessagingRecoveryModule({
    authorize: async () => allowed,
    readSecurityFacts: async () => { factReads += 1; return facts; },
    execute: async () => { checkouts += 1; throw checkoutFailure; },
  }).useCases.reconcileRecovery;
  return { input, recovery, checkoutFailure, setAllowed(value: boolean) { allowed = value; }, setFacts(value: MessagingSecurityFacts) { facts = value; }, get facts() { return facts; }, get checkouts() { return checkouts; }, get factReads() { return factReads; } };
}

describe("private native recovery gates", () => {
  it("should observe the external lock after awaited permission revalidation before opening SQL", async () => {
    const current = fixture();
    let initialPermissionChecked = false, locked = true, checkouts = 0;
    const recovery = buildMessagingRecoveryModule({
      authorize: async () => {
        if (initialPermissionChecked) { await Promise.resolve(); locked = false; }
        initialPermissionChecked = true;
        return true;
      },
      readSecurityFacts: async () => ({ ...current.facts, recoveryLocked: locked }),
      execute: async () => { checkouts += 1; throw current.checkoutFailure; },
    }).useCases.reconcileRecovery;
    await expect(recovery.execute(current.input)).rejects.toMatchObject({ code: "resource_unavailable" });
    expect(checkouts).toBe(0);
  });

  it("should classify dependency failures before checkout as unavailable while preserving the private cause", async () => {
    for (const stage of ["authority", "configuration"]) {
      const current = fixture();
      let checkouts = 0;
      const recovery = buildMessagingRecoveryModule({
        authorize: async () => { if (stage === "authority") throw current.checkoutFailure; return true; },
        readSecurityFacts: async () => { throw current.checkoutFailure; },
        execute: async () => { checkouts += 1; throw current.checkoutFailure; },
      }).useCases.reconcileRecovery;
      await expect(recovery.execute(current.input)).rejects.toMatchObject({ code: "resource_unavailable", cause: current.checkoutFailure });
      expect(checkouts).toBe(0);
    }
  });

  it("should reject missing backend authority before reading configuration or opening SQL", async () => {
    const current = fixture(); current.setAllowed(false);
    await expect(current.recovery.execute(current.input)).rejects.toMatchObject({ code: "permission_denied" });
    expect(current.factReads).toBe(0); expect(current.checkouts).toBe(0);
  });

  it("should reject an unlocked or replaced external scope before opening SQL", async () => {
    for (const patch of [{ recoveryLocked: false }, { environment: randomUUID() }, { securityEpoch: randomUUID() }]) {
      const current = fixture(); current.setFacts({ ...current.facts, ...patch });
      await expect(current.recovery.execute(current.input)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(current.checkouts).toBe(0);
    }
  });

  it("should preserve uncertainty and its private cause without another write or inferred counts", async () => {
    const current = fixture();
    await expect(current.recovery.execute(current.input)).rejects.toMatchObject({ code: "operation_unresolved", cause: current.checkoutFailure });
    expect(current.checkouts).toBe(1);
  });

  it("should keep inspection unavailable distinct from an unconfirmed mutation", async () => {
    const current = fixture();
    await expect(current.recovery.inspect(current.input)).rejects.toMatchObject({ code: "resource_unavailable", cause: current.checkoutFailure });
    expect(current.checkouts).toBe(1);
  });
});
