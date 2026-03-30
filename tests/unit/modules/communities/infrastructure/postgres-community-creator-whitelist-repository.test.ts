import { PostgresCommunityCreatorWhitelistRepository } from "@/src/modules/communities/infrastructure/repositories/postgres-community-creator-whitelist-repository";

describe("PostgresCommunityCreatorWhitelistRepository", () => {
  it("checks the whitelist with a normalized email", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          email: "prometido@example.com",
        },
      ],
    }));

    const repository = new PostgresCommunityCreatorWhitelistRepository(
      async (callback) =>
        callback({
          execute,
        } as never)
    );

    await expect(
      repository.isEmailAllowed("  PROMETIDO@Example.com ")
    ).resolves.toBe(true);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns false when the email is not present in the whitelist", async () => {
    const repository = new PostgresCommunityCreatorWhitelistRepository(
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
    const repository = new PostgresCommunityCreatorWhitelistRepository(
      async () => {
        throw {
          code: "42P01",
          message:
            'relation "public.community_creator_whitelist" does not exist',
        };
      }
    );

    await expect(repository.isEmailAllowed("missing@example.com")).resolves.toBe(false);
  });

  it("rethrows unrelated database errors even if the message mentions the whitelist table", async () => {
    const repository = new PostgresCommunityCreatorWhitelistRepository(
      async () => {
        throw {
          code: "42501",
          message:
            'permission denied for relation "public.community_creator_whitelist"',
        };
      }
    );

    await expect(repository.isEmailAllowed("missing@example.com")).rejects.toEqual({
      code: "42501",
      message:
        'permission denied for relation "public.community_creator_whitelist"',
    });
  });
});
