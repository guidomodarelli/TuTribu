/** @vitest-environment node */
/** Exercises how a tribe lifecycle change and its recovery answer when the platform cannot protect their original. @module tribe-lifecycle-platform-security-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PostgresTribeLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-lifecycle-repository";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { TRIBE_LIFECYCLE_HTTP_STATUS, TRIBE_LIFECYCLE_MESSAGE } from "@/src/modules/tribes/constants/tribe-lifecycle-http";
import type { TribeLifecycleContext } from "@/src/modules/tribes/domain/repositories/tribe-lifecycle-repository";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createAdmissionSyntheticHostingEnvironment } from "@/tests/support/admission-synthetic-hosting-environment";

/** @returns A lifecycle owner without hosting security whose transaction and admission ports must never be reached. */
function fixture(readSecurityConfig: () => Promise<MessagingSecurityConfig> = () => readMessagingHostingSecurityConfig({})) {
  // Owned transaction port double: reaching it would mean a change was attempted without a protected original.
  const execute = vi.fn(async (): Promise<never> => { throw new Error("The lifecycle transaction must not open without platform security"); });
  const repository = new PostgresTribeLifecycleRepository(execute, readSecurityConfig, () => { throw new Error("The admission scope closure must not be composed"); });
  const context: TribeLifecycleContext = { actorUserId: randomUUID(), sessionId: randomUUID(), tribeId: randomUUID(), requestId: randomUUID() };
  const input = { operationId: randomUUID(), action: "exit_academy" as const, expectedConfigVersion: 1, confirmed: true as const };
  return { execute, repository, context, input };
}

describe("tribe lifecycle without platform security", () => {
  it("should reject a new change definitively, with a conflict status and the platform copy, before opening a transaction", async () => {
    const data = fixture();
    await expect(data.repository.change(data.context, data.input)).rejects.toMatchObject({ code: "platform_security_unavailable", cause: { code: "messaging_crypto_configuration_invalid" } });
    expect(data.execute).not.toHaveBeenCalled();
    expect(TRIBE_LIFECYCLE_HTTP_STATUS.platform_security_unavailable).toBe(409);
    expect(TRIBE_LIFECYCLE_MESSAGE.platform_security_unavailable).toContain("equipo de TuTribu");
  });

  it("should reject a change during a platform recovery lock before signing inside a transaction", async () => {
    const data = fixture(async () => ({ ...await readMessagingHostingSecurityConfig(createAdmissionSyntheticHostingEnvironment()), recoveryLocked: true }));
    await expect(data.repository.change(data.context, data.input)).rejects.toMatchObject({ code: "platform_security_unavailable", cause: { code: "messaging_crypto_recovery_locked" } });
    expect(data.execute).not.toHaveBeenCalled();
  });

  it("should keep the recovery of an original unresolved instead of discarding it", async () => {
    const data = fixture();
    await expect(data.repository.recover(data.context, data.input)).rejects.toMatchObject({ code: "operation_unresolved", operationId: data.input.operationId });
    expect(data.execute).not.toHaveBeenCalled();
  });
});
