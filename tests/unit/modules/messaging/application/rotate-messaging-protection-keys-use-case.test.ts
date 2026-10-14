/** Validates private rotation bounds and preserves an uncertain original operation without retry. @module rotate-messaging-protection-keys-use-case-tests */
import { describe, expect, it, vi } from "vitest";
import { RotateMessagingProtectionKeysUseCase } from "@/src/modules/messaging/application/use-cases/rotate-messaging-protection-keys-use-case";
import { MessagingProtectionKeyRotationError } from "@/src/modules/messaging/domain/errors/messaging-protection-key-rotation-error";

describe("private protection-key rotation use case", () => {
  it("should use the bounded backend default and return the confirmed owner result", async () => {
    const result = { rotatedCredentials: 1, remainingCredentials: true, pendingOtpMaterial: true }, rotate = vi.fn().mockResolvedValue(result);
    expect(await new RotateMessagingProtectionKeysUseCase({ rotate }).execute()).toEqual(result);
    expect(rotate).toHaveBeenCalledExactlyOnceWith({ limit: 25 });
  });
  it("should forward supported limits without changing the independent provider credential", async () => {
    const rotate = vi.fn().mockResolvedValue({ rotatedCredentials: 0, remainingCredentials: false, pendingOtpMaterial: false }), useCase = new RotateMessagingProtectionKeysUseCase({ rotate });
    await useCase.execute({ limit: 1 }); await useCase.execute({ limit: 100 });
    expect(rotate.mock.calls).toEqual([[{ limit: 1 }], [{ limit: 100 }]]);
  });
  it("should reject invalid limits before any backend invocation", async () => {
    const rotate = vi.fn(), useCase = new RotateMessagingProtectionKeysUseCase({ rotate });
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 101]) await expect(useCase.execute({ limit })).rejects.toMatchObject({ code: "invalid_input" });
    expect(rotate).not.toHaveBeenCalled();
  });
  it("should preserve the typed original and cause when commit is unknown", async () => {
    const cause = new Error("Synthetic rotation commit acknowledgement missing"), error = new MessagingProtectionKeyRotationError("operation_unresolved", { cause }), rotate = vi.fn().mockRejectedValue(error);
    await expect(new RotateMessagingProtectionKeysUseCase({ rotate }).execute()).rejects.toBe(error);
    expect(error.cause).toBe(cause); expect(rotate).toHaveBeenCalledOnce();
  });
});
