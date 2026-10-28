import { vi, describe, it, expect } from "vitest";
import { PostgresTribeCreatorWhitelistRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-creator-whitelist-repository";

describe("PostgresTribeCreatorWhitelistRepository", () => {
  it("checks the whitelist with a normalized email", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async () => ({
      rows: [
        {
          email: "prometido@example.com",
        },
      ],
    }));

    const repository = new PostgresTribeCreatorWhitelistRepository(
      async (callback) =>
        callback({
          execute,
        } as never)
    );

    await expect(
      repository.isEmailAllowed("  PROMETIDO@Example.com ")
    ).resolves.toBe(true);
  });

  it("returns false when the email is not present in the whitelist", async () => {
    const repository = new PostgresTribeCreatorWhitelistRepository(
      async (callback) =>
        callback({
          execute: async () => ({
            rows: [],
          }),
        } as never)
    );

    await expect(repository.isEmailAllowed("missing@example.com")).resolves.toBe(false);
  });

  it("returns false when the whitelist table is not yet available in Postgres", async () => {
    const repository = new PostgresTribeCreatorWhitelistRepository(
      async () => {
        throw Object.assign(
          new Error('relation "public.tribe_creator_whitelist" does not exist'),
          { code: "42P01" }
        );
      }
    );

    await expect(repository.isEmailAllowed("missing@example.com")).resolves.toBe(false);
  });

  it("rethrows unrelated database errors even if the message mentions the whitelist table", async () => {
    const permissionError = Object.assign(
      new Error('permission denied for relation "public.tribe_creator_whitelist"'),
      { code: "42501" }
    );
    const repository = new PostgresTribeCreatorWhitelistRepository(
      async () => {
        throw permissionError;
      }
    );

    await expect(repository.isEmailAllowed("missing@example.com")).rejects.toBe(permissionError);
  });
});
