import { PostgresTribeCreatorWhitelistRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-creator-whitelist-repository";

function createWhitelistDatabase(rows: Array<{ email: string }>) {
  const executeTakeFirst = jest.fn(async () => rows[0]);
  const limit = jest.fn(() => ({
    executeTakeFirst,
  }));
  const where = jest.fn(() => ({
    limit,
  }));
  const select = jest.fn(() => ({
    where,
  }));
  const selectFrom = jest.fn(() => ({
    select,
  }));

  return {
    database: {
      kysely: {
        selectFrom,
      },
    },
    executeTakeFirst,
    limit,
    select,
    selectFrom,
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

    expect(queryBuilder.selectFrom).toHaveBeenCalledWith("tribe_creator_whitelist");
    expect(queryBuilder.select).toHaveBeenCalledWith("email");
    expect(queryBuilder.where).toHaveBeenCalledWith(
      "email",
      "=",
      "prometido@example.com"
    );
    expect(queryBuilder.limit).toHaveBeenCalledWith(1);
    expect(queryBuilder.executeTakeFirst).toHaveBeenCalledTimes(1);
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
