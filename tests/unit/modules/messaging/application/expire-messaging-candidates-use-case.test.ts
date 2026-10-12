/** Exercises the bounded maintenance entrypoint through its own port without manufacturing confirmed work after failure. @module expire-messaging-candidates-use-case-tests */
import { describe, expect, it } from "vitest";
import { ExpireMessagingCandidatesUseCase } from "@/src/modules/messaging/application/use-cases/expire-messaging-candidates-use-case";
import { MessagingCandidateExpirationError } from "@/src/modules/messaging/domain/errors/messaging-candidate-expiration-error";

describe("expire messaging candidates", () => {
  it("should use one bounded owner call and return only its confirmed counts", async () => {
    const commands: Array<{ limit: number }> = [];
    const useCase = new ExpireMessagingCandidatesUseCase({ expire: async (command) => { commands.push(command); return { expired: 3, purgedImmediately: 1 }; } });
    expect(await useCase.execute()).toEqual({ expired: 3, purgedImmediately: 1 });
    expect(commands).toEqual([{ limit: 50 }]);
  });

  it.each([0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("should reject invalid limit %s before reaching the maintenance owner", async (limit) => {
    let calls = 0;
    const useCase = new ExpireMessagingCandidatesUseCase({ expire: async () => { calls += 1; return { expired: 0, purgedImmediately: 0 }; } });
    await expect(useCase.execute({ limit })).rejects.toBeInstanceOf(MessagingCandidateExpirationError);
    expect(calls).toBe(0);
  });

  it("should preserve an unconfirmed commit instead of returning an empty success", async () => {
    const failure = new MessagingCandidateExpirationError("operation_unresolved", { cause: new Error("Controlled candidate transaction reply loss") });
    const useCase = new ExpireMessagingCandidatesUseCase({ expire: async () => { throw failure; } });
    await expect(useCase.execute({ limit: 1 })).rejects.toBe(failure);
  });
});
