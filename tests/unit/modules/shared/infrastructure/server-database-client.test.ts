/** @vitest-environment node */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

describe("createServerDatabaseClient", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = "postgres://tutribu.example.com/db";
    delete process.env.DATABASE_MAINTENANCE_URL;
    delete process.env.DATABASE_MIGRATION_URL;
    delete (globalThis as { __tuTribuDatabasePool?: unknown })
      .__tuTribuDatabasePool;
    delete (globalThis as { __tuTribuMaintenanceDatabasePool?: unknown })
      .__tuTribuMaintenanceDatabasePool;
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("runs request context settings sequentially on the transaction client", async () => {
    let activeQueryCount = 0;
    let detectedOverlappingQuery = false;
    const executedStatements: string[] = [];
    const query = vi.fn(async (statement?: unknown) => {
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
    const release = vi.fn();
    const client = Object.assign(new EventEmitter(), {
      query,
      release,
    });

    vi.doMock("pg", () => ({
      Pool: vi.fn(function () { return ({
        connect: vi.fn(async () => client),
        on: vi.fn(),
      }); }),
    }));
    vi.doMock("drizzle-orm/node-postgres", () => ({
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
    // BEGIN + idle-in-transaction guard + 3 request-context settings + COMMIT.
    expect(query).toHaveBeenCalledTimes(6);
    expect(executedStatements[0]).toBe("BEGIN");
    expect(executedStatements[executedStatements.length - 1]).toBe("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases a checked-out client with the emitted error when the connection closes asynchronously", async () => {
    const connectionError = new Error("idle-in-transaction timeout");
    let activeClient: EventEmitter | null = null;
    const release = vi.fn();
    const query = vi.fn(async (statement?: unknown) => {
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

    vi.doMock("pg", () => ({
      Pool: vi.fn(function () { return ({
        connect: vi.fn(async () => client),
        on: vi.fn(),
      }); }),
    }));
    vi.doMock("drizzle-orm/node-postgres", () => ({
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
    const query = vi.fn(async (statement?: unknown) => {
      if (typeof statement === "string") {
        executedStatements.push(statement);
      }

      return {
        rows: [],
      };
    });
    const release = vi.fn();
    const client = Object.assign(new EventEmitter(), {
      query,
      release,
    });
    const pool = { connect: vi.fn(async () => client) };

    vi.doMock("pg", () => ({
      Pool: vi.fn(),
    }));
    vi.doMock("drizzle-orm/node-postgres", () => ({
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

  function buildPoolSpy() {
    const poolConnectionStrings: Array<string | undefined> = [];
    const release = vi.fn();
    const client = Object.assign(new EventEmitter(), {
      query: vi.fn(async () => ({ rows: [] })),
      release,
    });

    vi.doMock("pg", () => ({
      Pool: vi.fn(function (configuration: { connectionString?: string }) {
        poolConnectionStrings.push(configuration.connectionString);

        return {
          connect: vi.fn(async () => client),
          on: vi.fn(),
        };
      }),
    }));
    vi.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (databaseClient: { query: () => Promise<unknown> }) => ({
        execute: () => databaseClient.query(),
      }),
    }));

    return { poolConnectionStrings };
  }

  it("checks out the maintenance pool from the maintenance connection when usage is maintenance", async () => {
    process.env.DATABASE_MAINTENANCE_URL =
      "postgres://maintenance.tutribu.example.com/db";
    const { poolConnectionStrings } = buildPoolSpy();

    const { createServerDatabaseClient, DATABASE_CONNECTION_USAGE } =
      await import(
        "@/src/modules/shared/infrastructure/database/server-database-client"
      );

    const databaseClient = await createServerDatabaseClient(
      DATABASE_CONNECTION_USAGE.maintenance
    );
    await databaseClient.withRequestContext(
      { email: null, userId: null },
      async () => "ok"
    );

    expect(poolConnectionStrings).toEqual([
      "postgres://maintenance.tutribu.example.com/db",
    ]);
  });

  it("checks out the runtime pool from DATABASE_URL by default", async () => {
    process.env.DATABASE_MAINTENANCE_URL =
      "postgres://maintenance.tutribu.example.com/db";
    const { poolConnectionStrings } = buildPoolSpy();

    const { createServerDatabaseClient } = await import(
      "@/src/modules/shared/infrastructure/database/server-database-client"
    );

    const databaseClient = await createServerDatabaseClient();
    await databaseClient.withRequestContext(
      { email: null, userId: null },
      async () => "ok"
    );

    expect(poolConnectionStrings).toEqual([
      "postgres://tutribu.example.com/db",
    ]);
  });

  it("keeps the request and maintenance pools on separate cached connections", async () => {
    process.env.DATABASE_MAINTENANCE_URL =
      "postgres://maintenance.tutribu.example.com/db";
    const { poolConnectionStrings } = buildPoolSpy();

    const { createServerDatabaseClient, DATABASE_CONNECTION_USAGE } =
      await import(
        "@/src/modules/shared/infrastructure/database/server-database-client"
      );

    const runStatements = async () => "ok";
    const requestContext = { email: null, userId: null };

    await (await createServerDatabaseClient()).withRequestContext(
      requestContext,
      runStatements
    );
    await (
      await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance)
    ).withRequestContext(requestContext, runStatements);
    await (
      await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance)
    ).withRequestContext(requestContext, runStatements);

    // One request pool + one maintenance pool, each constructed once and reused.
    expect(poolConnectionStrings).toEqual([
      "postgres://tutribu.example.com/db",
      "postgres://maintenance.tutribu.example.com/db",
    ]);
  });
});
