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

/** @returns A lifecycle owner without hosting security whose database is unreachable and whose admission port must never be reached. */
function fixture(readSecurityConfig: () => Promise<MessagingSecurityConfig> = () => readMessagingHostingSecurityConfig({})) {
  // Owned transaction port double: the only transaction allowed is the lookup of the original, and the database cannot answer it.
  const execute = vi.fn(async (): Promise<never> => { throw new Error("Synthetic lifecycle database unreachable"); });
  const repository = new PostgresTribeLifecycleRepository(execute, readSecurityConfig, () => { throw new Error("The admission scope closure must not be composed"); });
  const context: TribeLifecycleContext = { actorUserId: randomUUID(), sessionId: randomUUID(), tribeId: randomUUID(), requestId: randomUUID() };
  const input = { operationId: randomUUID(), action: "exit_academy" as const, expectedConfigVersion: 1, confirmed: true as const };
  return { execute, repository, context, input };
}

describe("tribe lifecycle without platform security", () => {
  it("should name the platform requirement with a conflict status and the platform copy", () => {
    expect(TRIBE_LIFECYCLE_HTTP_STATUS.platform_security_unavailable).toBe(409);
    expect(TRIBE_LIFECYCLE_MESSAGE.platform_security_unavailable).toContain("equipo de TuTribu");
  });

  it("should keep a change unresolved, never claiming that nothing was registered, when its original cannot be looked up", async () => {
    const data = fixture();
    await expect(data.repository.change(data.context, data.input)).rejects.toMatchObject({ code: "operation_unresolved", operationId: data.input.operationId, cause: { errors: [{ code: "platform_security_unavailable", cause: { code: "messaging_crypto_configuration_invalid" } }, { message: "Synthetic lifecycle database unreachable" }] } });
    expect(data.execute).toHaveBeenCalledTimes(1);
  });

  it("should check the original of a change during a platform recovery lock before signing anything", async () => {
    const data = fixture(async () => ({ ...await readMessagingHostingSecurityConfig(createAdmissionSyntheticHostingEnvironment()), recoveryLocked: true }));
    await expect(data.repository.change(data.context, data.input)).rejects.toMatchObject({ code: "operation_unresolved", operationId: data.input.operationId, cause: { errors: [{ code: "platform_security_unavailable", cause: { code: "messaging_crypto_recovery_locked" } }, expect.anything()] } });
    expect(data.execute).toHaveBeenCalledTimes(1);
  });

  it("should keep the recovery of an original unresolved instead of discarding it", async () => {
    const data = fixture();
    await expect(data.repository.recover(data.context, data.input)).rejects.toMatchObject({ code: "operation_unresolved", operationId: data.input.operationId });
    expect(data.execute).not.toHaveBeenCalled();
  });
});
