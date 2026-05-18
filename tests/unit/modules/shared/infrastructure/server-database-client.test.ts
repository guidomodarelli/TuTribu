/** @jest-environment node */

jest.setTimeout(15000);

function collectStatementValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if ("value" in value) {
    const statementValue = (value as { value: unknown }).value;

    if (typeof statementValue === "string") {
      return [statementValue];
    }

    if (Array.isArray(statementValue)) {
      return statementValue.flatMap(collectStatementValues);
    }
  }

  if ("queryChunks" in value) {
    return ((value as { queryChunks?: unknown[] }).queryChunks ?? []).flatMap(
      collectStatementValues
    );
  }

  return Object.values(value).flatMap(collectStatementValues);
}

describe("createServerDatabaseClient", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "postgres://tutribu.example.com/db";
    process.env.TUTRIBU_OWNER_EMAIL = " Owner@Example.COM ";
    delete (globalThis as { __tuTribuDatabasePool?: unknown })
      .__tuTribuDatabasePool;
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("runs request context settings sequentially on the transaction client", async () => {
    let activeQueryCount = 0;
    let detectedOverlappingQuery = false;
    const query = jest.fn(async () => {
      detectedOverlappingQuery = detectedOverlappingQuery || activeQueryCount > 0;
      activeQueryCount += 1;

      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      activeQueryCount -= 1;

      return {
        rows: [],
      };
    });
    const release = jest.fn();

    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({
        connect: jest.fn(async () => ({
          query,
          release,
        })),
      })),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (client: { query: () => Promise<unknown> }) => ({
        execute: () => client.query(),
      }),
    }));

    const { createServerDatabaseClient } = await import(
      "@/src/modules/shared/infrastructure/database/server-database-client"
    );

    const databaseClient = await createServerDatabaseClient();

    await databaseClient.withRequestContext(
      {
        email: "leader@example.com",
        mercadoPagoWebhookVerified: true,
        userId: "member-1",
      },
      async () => "ok"
    );

    expect(detectedOverlappingQuery).toBe(false);
    expect(query).toHaveBeenCalledTimes(6);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("sets the normalized owner email as a request database setting", async () => {
    const query = jest.fn(async (statement: unknown) => ({
      rows: [],
      statement,
    }));
    const release = jest.fn();

    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({
        connect: jest.fn(async () => ({
          query,
          release,
        })),
      })),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (client: { query: (statement: unknown) => Promise<unknown> }) => ({
        execute: (statement: unknown) => client.query(statement),
      }),
    }));

    const { createServerDatabaseClient } = await import(
      "@/src/modules/shared/infrastructure/database/server-database-client"
    );

    const databaseClient = await createServerDatabaseClient();

    await databaseClient.withRequestContext(
      {
        email: "leader@example.com",
        userId: "member-1",
      },
      async () => "ok"
    );

    const ownerEmailStatement = query.mock.calls.find((call) =>
      collectStatementValues(call[0]).includes("app.owner_email")
    )?.[0];

    expect(ownerEmailStatement).toBeDefined();
    expect(collectStatementValues(ownerEmailStatement)).toContain(
      "owner@example.com"
    );
  });

  it("exposes Kysely on the same request transaction client", async () => {
    const query = jest.fn(async (statement: unknown) => ({
      rows:
        typeof statement === "string" &&
        statement.includes("tribe_creator_whitelist")
          ? [{ email: "leader@example.com" }]
          : [],
      rowCount: 1,
    }));
    const release = jest.fn();

    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({
        connect: jest.fn(async () => ({
          query,
          release,
        })),
      })),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (client: { query: (statement: unknown) => Promise<unknown> }) => ({
        execute: (statement: unknown) => client.query(statement),
      }),
    }));

    const { createServerDatabaseClient } = await import(
      "@/src/modules/shared/infrastructure/database/server-database-client"
    );

    const databaseClient = await createServerDatabaseClient();

    const allowedEmail = await databaseClient.withRequestContext(
      {
        email: "leader@example.com",
        userId: "member-1",
      },
      (database) =>
        database.kysely
          .selectFrom("tribe_creator_whitelist")
          .select("email")
          .where("email", "=", "leader@example.com")
          .executeTakeFirst()
    );

    const kyselyQueryCall = query.mock.calls.find(
      ([statement]) =>
        typeof statement === "string" &&
        statement.includes("tribe_creator_whitelist")
    );

    expect(allowedEmail).toEqual({ email: "leader@example.com" });
    expect(kyselyQueryCall).toBeDefined();
    expect(kyselyQueryCall?.[1]).toEqual(["leader@example.com"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back handled Kysely transaction errors to a savepoint before committing the request", async () => {
    const query = jest.fn(async (statement: unknown) => ({
      rows:
        typeof statement === "string" &&
        statement.includes("tribe_creator_whitelist")
          ? [{ email: "leader@example.com" }]
          : [],
      rowCount: 1,
    }));
    const release = jest.fn();

    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({
        connect: jest.fn(async () => ({
          query,
          release,
        })),
      })),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (client: { query: (statement: unknown) => Promise<unknown> }) => ({
        execute: (statement: unknown) => client.query(statement),
      }),
    }));

    const { createServerDatabaseClient } = await import(
      "@/src/modules/shared/infrastructure/database/server-database-client"
    );

    const databaseClient = await createServerDatabaseClient();

    await databaseClient.withRequestContext(
      {
        email: "leader@example.com",
        userId: "member-1",
      },
      async (database) => {
        await expect(
          database.kysely.transaction().execute(async (transaction) => {
            await transaction
              .selectFrom("tribe_creator_whitelist")
              .select("email")
              .where("email", "=", "leader@example.com")
              .executeTakeFirst();

            throw new Error("Controlled transaction failure");
          })
        ).rejects.toThrow("Controlled transaction failure");

        return "handled";
      }
    );

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "SAVEPOINT kysely_request_transaction_1",
      expect.stringContaining("tribe_creator_whitelist"),
      "ROLLBACK TO SAVEPOINT kysely_request_transaction_1",
      "RELEASE SAVEPOINT kysely_request_transaction_1",
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent Kysely transactions on the request client", async () => {
    const query = jest.fn(async (statement: unknown) => ({
      rows:
        typeof statement === "string" &&
        statement.includes("tribe_creator_whitelist")
          ? [{ email: "leader@example.com" }]
          : [],
      rowCount: 1,
    }));
    const release = jest.fn();

    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({
        connect: jest.fn(async () => ({
          query,
          release,
        })),
      })),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (client: { query: (statement: unknown) => Promise<unknown> }) => ({
        execute: (statement: unknown) => client.query(statement),
      }),
    }));

    const { createServerDatabaseClient } = await import(
      "@/src/modules/shared/infrastructure/database/server-database-client"
    );

    const databaseClient = await createServerDatabaseClient();

    await databaseClient.withRequestContext(
      {
        email: "leader@example.com",
        userId: "member-1",
      },
      async (database) => {
        await Promise.all([
          database.kysely.transaction().execute((transaction) =>
            transaction
              .selectFrom("tribe_creator_whitelist")
              .select("email")
              .where("email", "=", "first@example.com")
              .executeTakeFirst()
          ),
          database.kysely.transaction().execute((transaction) =>
            transaction
              .selectFrom("tribe_creator_whitelist")
              .select("email")
              .where("email", "=", "second@example.com")
              .executeTakeFirst()
          ),
        ]);
      }
    );

    const transactionCalls = query.mock.calls
      .filter(([statement]) =>
        typeof statement === "string" &&
        (statement.includes("SAVEPOINT") ||
          statement.includes("tribe_creator_whitelist"))
      )
      .map(([statement, parameters]) => [statement, parameters]);

    expect(transactionCalls).toEqual([
      ["SAVEPOINT kysely_request_transaction_1", undefined],
      [expect.stringContaining("tribe_creator_whitelist"), ["first@example.com"]],
      ["RELEASE SAVEPOINT kysely_request_transaction_1", undefined],
      ["SAVEPOINT kysely_request_transaction_2", undefined],
      [expect.stringContaining("tribe_creator_whitelist"), ["second@example.com"]],
      ["RELEASE SAVEPOINT kysely_request_transaction_2", undefined],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
