/** Exercises bounded expiration through the application-owned maintenance port. @module expire-admission-requests-use-case-tests */
import { describe, expect, it } from "vitest";
import { ExpireAdmissionRequestsUseCase } from "@/src/modules/academy-admissions/application/use-cases/expire-admission-requests-use-case";
import { AdmissionExpirationError } from "@/src/modules/academy-admissions/domain/errors/admission-expiration-error";

describe("expire admission requests", () => {
  it("should return confirmed expirations with the default bounded batch", async () => {
    const commands: { limit: number }[] = [];
    const useCase = new ExpireAdmissionRequestsUseCase({ expire: async (command) => { commands.push(command); return 3; } });
    expect(await useCase.execute()).toEqual({ expired: 3 });
    expect(commands).toEqual([{ limit: 50 }]);
  });

  it.each([0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("should reject invalid batch %s before invoking storage", async (limit) => {
    let calls = 0;
    const useCase = new ExpireAdmissionRequestsUseCase({ expire: async () => { calls += 1; return 0; } });
    await expect(useCase.execute({ limit })).rejects.toMatchObject({ code: "invalid_input" });
    expect(calls).toBe(0);
  });

  it("should preserve unconfirmed completion without claiming a zero batch", async () => {
    const cause = new Error("Synthetic expiration commit response unavailable");
    const failure = new AdmissionExpirationError("operation_unresolved", { cause });
    const useCase = new ExpireAdmissionRequestsUseCase({ expire: async () => { throw failure; } });
    await expect(useCase.execute({ limit: 1 })).rejects.toBe(failure);
    expect(failure.cause).toBe(cause);
  });
});
