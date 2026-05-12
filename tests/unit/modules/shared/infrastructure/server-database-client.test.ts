/** @jest-environment node */

describe("createServerDatabaseClient", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "postgres://tutribu.example.com/db";
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
    expect(query).toHaveBeenCalledTimes(5);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
