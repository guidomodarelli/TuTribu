import { PostgresTribeCreatorWhitelistRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-creator-whitelist-repository";

function createWhitelistDatabase(rows: Array<{ email: string }>) {
  const limit = jest.fn(async () => rows);
  const where = jest.fn(() => ({
    limit,
  }));
  const from = jest.fn(() => ({
    where,
  }));
  const select = jest.fn(() => ({
    from,
  }));

  return {
    database: {
      select,
    },
    from,
    limit,
    select,
    where,
  };
}

describe("PostgresTribeCreatorWhitelistRepository", () => {
  it("checks the whitelist with the typed query builder", async () => {
    const queryBuilder = createWhitelistDatabase([
      {
        email: "prometido@example.com",
      },
    ]);

    const repository = new PostgresTribeCreatorWhitelistRepository(
      async (callback) => callback(queryBuilder.database as never)
    );

    await expect(
      repository.isEmailAllowed("  PROMETIDO@Example.com ")
    ).resolves.toBe(true);

    expect(queryBuilder.select).toHaveBeenCalledTimes(1);
    expect(queryBuilder.from).toHaveBeenCalledTimes(1);
    expect(queryBuilder.where).toHaveBeenCalledTimes(1);
    expect(queryBuilder.limit).toHaveBeenCalledWith(1);
  });

  it("returns false when the email is not present in the whitelist", async () => {
    const queryBuilder = createWhitelistDatabase([]);

    const repository = new PostgresTribeCreatorWhitelistRepository(
      async (callback) => callback(queryBuilder.database as never)
    );

    await expect(repository.isEmailAllowed("missing@example.com")).resolves.toBe(false);
  });

  it("returns false when the whitelist table is not yet available in Postgres", async () => {
    const repository = new PostgresTribeCreatorWhitelistRepository(
      async () => {
        throw {
          code: "42P01",
          message:
            'relation "public.tribe_creator_whitelist" does not exist',
        };
      }
    );

    await expect(repository.isEmailAllowed("missing@example.com")).resolves.toBe(false);
  });

  it("rethrows unrelated database errors even if the message mentions the whitelist table", async () => {
    const repository = new PostgresTribeCreatorWhitelistRepository(
      async () => {
        throw {
          code: "42501",
          message:
            'permission denied for relation "public.tribe_creator_whitelist"',
        };
      }
    );

    await expect(repository.isEmailAllowed("missing@example.com")).rejects.toEqual({
      code: "42501",
      message:
        'permission denied for relation "public.tribe_creator_whitelist"',
    });
  });
});
