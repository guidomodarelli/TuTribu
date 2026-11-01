/** @vitest-environment node */
/** Exercises how policy writes and the hosting security check behave when the deployment lacks the messaging security. @module admission-policy-security-requirement-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PostgresAdmissionPolicyRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-repository";
import { isMessagingHostingSecurityConfigured, readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_HOSTING_ENV } from "@/src/modules/messaging/constants/messaging-hosting";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import { createAdmissionSyntheticHostingEnvironment } from "@/tests/support/admission-synthetic-hosting-environment";

/**
 * @param registered - Whether the transaction port answers that the original operation is already in the ledger.
 * @returns A leader write context and a policy repository whose transaction port only answers the original lookup.
 */
function fixture(registered: boolean) {
  const tribeId = randomUUID();
  const context: AuthorizedAdmissionContext = { userId: randomUUID(), sessionId: randomUUID(), tribeId, requestId: randomUUID(), role: "leader", membershipStatus: "active", resourceId: tribeId, action: "configure_policy", sensitiveOperation: "activate_admission_policy" };
  // Owned transaction port double: it answers the original lookup and never runs the ledger or the business mutation.
  const lookup = vi.fn(async () => registered);
  const execute = <Result>(): Promise<Result> => lookup() as Promise<Result>;
  const repository = new PostgresAdmissionPolicyRepository(execute, () => readMessagingHostingSecurityConfig({}), () => { throw new Error("Preparation must not be composed"); });
  return { context, execute: lookup, repository };
}

describe("hosting messaging security for admission policy writes", () => {
  it("should tell a usable hosting configuration from a missing or broken one", async () => {
    const environment = createAdmissionSyntheticHostingEnvironment();
    expect(await isMessagingHostingSecurityConfigured(environment)).toBe(true);
    expect(await isMessagingHostingSecurityConfigured({})).toBe(false);
    expect(await isMessagingHostingSecurityConfigured({ ...environment, [MESSAGING_HOSTING_ENV.keyrings]: "{" })).toBe(false);
  });

  it("should reject every new policy write as a definitive platform requirement after one original lookup each", async () => {
    const data = fixture(false);
    const writes = [
      () => data.repository.initialize({ context: { ...data.context, sensitiveOperation: "update_admission_policy" }, operationId: randomUUID(), confirmed: true, type: "initialize_admission_policy" }),
      () => data.repository.activate({ context: data.context, operationId: randomUUID(), confirmed: true, type: "activate_admission_policy", expectedVersion: 1 }),
      () => data.repository.pause({ context: { ...data.context, sensitiveOperation: "pause_admission_policy" }, operationId: randomUUID(), confirmed: true, type: "pause_admission_policy", expectedVersion: 2, reason: "Pausa sintética" }),
    ];
    for (const write of writes) {
      await expect(write()).rejects.toMatchObject({ code: "admission_ineligible", cause: { code: "admission_security_unconfigured", cause: { code: "messaging_crypto_configuration_invalid" } } });
    }
    expect(data.execute).toHaveBeenCalledTimes(writes.length);
  });

  it("should keep the resend of an already registered original unresolved, so the browser keeps it to recover later", async () => {
    const data = fixture(true), operationId = randomUUID();
    await expect(data.repository.activate({ context: data.context, operationId, confirmed: true, type: "activate_admission_policy", expectedVersion: 1 })).rejects.toMatchObject({ code: "operation_unresolved", operationId, cause: { code: "messaging_crypto_configuration_invalid" } });
    expect(data.execute).toHaveBeenCalledOnce();
  });
});
