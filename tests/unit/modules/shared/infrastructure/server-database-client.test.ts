/** @jest-environment node */

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
});
