/** @jest-environment node */

import { EventEmitter } from "node:events";

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
    const executedStatements: string[] = [];
    const query = jest.fn(async (statement?: unknown) => {
      if (typeof statement === "string") {
        executedStatements.push(statement);
      }
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
    const client = Object.assign(new EventEmitter(), {
      query,
      release,
    });

    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({
        connect: jest.fn(async () => client),
        on: jest.fn(),
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
    // BEGIN + idle-in-transaction guard + 5 request-context settings + COMMIT.
    expect(query).toHaveBeenCalledTimes(8);
    expect(executedStatements[0]).toBe("BEGIN");
    expect(executedStatements[executedStatements.length - 1]).toBe("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases a checked-out client with the emitted error when the connection closes asynchronously", async () => {
    const connectionError = new Error("idle-in-transaction timeout");
    let activeClient: EventEmitter | null = null;
    const release = jest.fn();
    const query = jest.fn(async (statement?: unknown) => {
      if (statement === "BEGIN") {
        activeClient?.emit("error", connectionError);
      }

      return {
        rows: [],
      };
    });
    const client = Object.assign(new EventEmitter(), {
      query,
      release,
    });
    activeClient = client;

    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({
        connect: jest.fn(async () => client),
        on: jest.fn(),
      })),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (databaseClient: { query: () => Promise<unknown> }) => ({
        execute: () => databaseClient.query(),
      }),
    }));

    const { createServerDatabaseClient } = await import(
      "@/src/modules/shared/infrastructure/database/server-database-client"
    );

    const databaseClient = await createServerDatabaseClient();

    await expect(
      databaseClient.withRequestContext(
        {
          email: "leader@example.com",
          userId: "member-1",
        },
        async () => "ok"
      )
    ).resolves.toBe("ok");

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(connectionError);
    expect(query).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("guards and commits a transaction without request-context settings when no prepare is provided", async () => {
    const executedStatements: string[] = [];
    const query = jest.fn(async (statement?: unknown) => {
      if (typeof statement === "string") {
        executedStatements.push(statement);
      }

      return {
        rows: [],
      };
    });
    const release = jest.fn();
    const client = Object.assign(new EventEmitter(), {
      query,
      release,
    });
    const pool = { connect: jest.fn(async () => client) };

    jest.doMock("pg", () => ({
      Pool: jest.fn(),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (databaseClient: { query: () => Promise<unknown> }) => ({
        execute: () => databaseClient.query(),
      }),
    }));

    const { runWithGuardedTransaction } = await import(
      "@/src/modules/shared/infrastructure/database/server-database-client"
    );

    await expect(
      runWithGuardedTransaction(pool as never, async () => "done")
    ).resolves.toBe("done");

    // BEGIN + idle-in-transaction guard + COMMIT, without request-context settings.
    expect(query).toHaveBeenCalledTimes(3);
    expect(executedStatements).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(undefined);
  });
});
