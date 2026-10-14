/** Validates all secret-retention ceilings before candidate or envelope maintenance. @module purge-messaging-secrets-use-case-tests */
import { describe, expect, it, vi } from "vitest";
import { PurgeMessagingSecretsUseCase } from "@/src/modules/messaging/application/use-cases/purge-messaging-secrets-use-case";
import { MessagingRetentionError } from "@/src/modules/messaging/domain/errors/messaging-retention-error";

describe("aggregate messaging secret retention", () => {
  it("should return confirmed owner counts when using private defaults", async () => {
    const result = { candidates: { expired: 1, purgedImmediately: 0 }, retiredSecretsPurged: 1, verificationMaterialPurged: 1 };
    const purge = vi.fn().mockResolvedValue(result);
    expect(await new PurgeMessagingSecretsUseCase({ purge }).execute()).toEqual(result);
    expect(purge).toHaveBeenCalledExactlyOnceWith({ candidateLimit: 50, retiredSecretLimit: 100, verificationLimit: 100 });
  });

  it("should keep independent ceilings when using minimum and maximum supported batches", async () => {
    const purge = vi.fn().mockResolvedValue({}), useCase = new PurgeMessagingSecretsUseCase({ purge });
    await useCase.execute({ candidateLimit: 1, retiredSecretLimit: 1, verificationLimit: 1 });
    await useCase.execute({ candidateLimit: 100, retiredSecretLimit: 100, verificationLimit: 100 });
    expect(purge.mock.calls).toEqual([[{ candidateLimit: 1, retiredSecretLimit: 1, verificationLimit: 1 }], [{ candidateLimit: 100, retiredSecretLimit: 100, verificationLimit: 100 }]]);
  });

  it("should reject invalid values in every field before invoking any retention work", async () => {
    const purge = vi.fn(), useCase = new PurgeMessagingSecretsUseCase({ purge });
    for (const field of ["candidateLimit", "retiredSecretLimit", "verificationLimit"] as const) {
      for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 101]) {
        await expect(useCase.execute({ [field]: limit })).rejects.toMatchObject({ code: "invalid_input" });
      }
    }
    expect(purge).not.toHaveBeenCalled();
  });

  it("should retain the original uncertain result without automatically invoking another purge", async () => {
    const cause = new Error("Synthetic original secret-retention acknowledgement unavailable"), original = new MessagingRetentionError("operation_unresolved", { cause });
    const purge = vi.fn().mockRejectedValue(original);
    await expect(new PurgeMessagingSecretsUseCase({ purge }).execute()).rejects.toBe(original);
    expect(original.cause).toBe(cause);
    expect(purge).toHaveBeenCalledOnce();
  });
});
