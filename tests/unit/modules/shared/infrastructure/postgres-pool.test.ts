/** @vitest-environment node */

import { vi, describe, it, expect, beforeEach } from "vitest";
describe("Postgres pool factory", () => {
  const loggerError = vi.fn();
  const loggerWarn = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    loggerError.mockReset();
    loggerWarn.mockReset();
  });

  it("logs idle client termination errors without exposing client connection details", async () => {
    const poolOn = vi.fn();
    const poolInstance = {
      on: poolOn,
    };
    const Pool = vi.fn(function (...args: unknown[]) { void args; return poolInstance; });

    vi.doMock("pg", () => ({
      Pool,
    }));
    vi.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: () => ({
          error: loggerError,
          info: vi.fn(),
          warn: loggerWarn,
        }),
      })
    );

    const { createPostgresPool } = await import(
      "@/src/modules/shared/infrastructure/database/postgres-pool"
    );

    createPostgresPool({
      connectionString: "postgres://user:secret@database.example.com/db",
      operation: "runtime_database_pool_idle_error",
    });

    expect(Pool).toHaveBeenCalledWith({
      allowExitOnIdle: true,
      connectionString: "postgres://user:secret@database.example.com/db",
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 5000,
      max: 10,
      maxLifetimeSeconds: 60,
      onConnect: expect.any(Function),
    });
    expect(poolOn).toHaveBeenCalledWith("error", expect.any(Function));

    const [, idleErrorHandler] = poolOn.mock.calls[0] as [
      string,
      (error: unknown, client: unknown) => void,
    ];

    idleErrorHandler(
      {
        code: "57P01",
        severity: "FATAL",
        message: "terminating connection due to administrator command",
      },
      {
        connectionParameters: {
          host: "database.example.com",
          password: "secret",
        },
      }
    );

    expect(loggerWarn).toHaveBeenCalledWith({
      message: "Postgres idle client was closed by the database backend.",
      metadata: {
        dependency: "postgres",
        errorCode: "57P01",
        errorSeverity: "FATAL",
        isTransientConnectionTermination: true,
      },
      error: expect.objectContaining({
        code: "57P01",
      }),
    });
    expect(loggerError).not.toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          client: expect.anything(),
          connectionString: expect.anything(),
          host: expect.anything(),
        }),
      })
    );
  });

  it("logs unexpected idle client errors as errors with safe metadata", async () => {
    const poolOn = vi.fn();

    vi.doMock("pg", () => ({
      Pool: vi.fn(function () { return ({
        on: poolOn,
      }); }),
    }));
    vi.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: () => ({
          error: loggerError,
          info: vi.fn(),
          warn: loggerWarn,
        }),
      })
    );

    const { createPostgresPool } = await import(
      "@/src/modules/shared/infrastructure/database/postgres-pool"
    );

    createPostgresPool({
      connectionString: "postgres://user:secret@database.example.com/db",
      operation: "better_auth_database_pool_idle_error",
    });

    const [, idleErrorHandler] = poolOn.mock.calls[0] as [
      string,
      (error: unknown, client: unknown) => void,
    ];

    idleErrorHandler({
      code: "08006",
      severity: "FATAL",
      message: "connection failure",
    }, undefined);

    expect(loggerError).toHaveBeenCalledWith({
      message: "Postgres idle client emitted an unexpected connection error.",
      metadata: {
        dependency: "postgres",
        errorCode: "08006",
        errorSeverity: "FATAL",
        isTransientConnectionTermination: false,
      },
      error: expect.objectContaining({
        code: "08006",
      }),
    });
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it("applies the idle-in-transaction guard on every new connection", async () => {
    const Pool = vi.fn(function (...args: unknown[]) { void args; return ({
      on: vi.fn(),
    }); });

    vi.doMock("pg", () => ({
      Pool,
    }));
    vi.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: () => ({
          error: loggerError,
          info: vi.fn(),
          warn: loggerWarn,
        }),
      })
    );

    const { createPostgresPool } = await import(
      "@/src/modules/shared/infrastructure/database/postgres-pool"
    );

    createPostgresPool({
      connectionString: "postgres://user:secret@database.example.com/db",
      operation: "better_auth_database_pool_idle_error",
    });

    const poolConfig = Pool.mock.calls[0][0] as {
      onConnect: (client: unknown) => Promise<void>;
    };
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(poolConfig.onConnect({ query })).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith("select set_config($1, $2, false)", [
      "idle_in_transaction_session_timeout",
      "30000",
    ]);
  });

  it("rejects new connections when the idle-in-transaction guard cannot be applied", async () => {
    const Pool = vi.fn(function (...args: unknown[]) { void args; return ({
      on: vi.fn(),
    }); });

    vi.doMock("pg", () => ({
      Pool,
    }));
    vi.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: () => ({
          error: loggerError,
          info: vi.fn(),
          warn: loggerWarn,
        }),
      })
    );

    const { createPostgresPool } = await import(
      "@/src/modules/shared/infrastructure/database/postgres-pool"
    );

    createPostgresPool({
      connectionString: "postgres://user:secret@database.example.com/db",
      operation: "better_auth_database_pool_idle_error",
    });

    const poolConfig = Pool.mock.calls[0][0] as {
      onConnect: (client: unknown) => Promise<void>;
    };
    const guardError = Object.assign(new Error("set_config failed"), {
      code: "42501",
      severity: "ERROR",
    });

    await expect(
      poolConfig.onConnect({
        query: vi.fn().mockRejectedValue(guardError),
      })
    ).rejects.toBe(guardError);

    expect(loggerWarn).toHaveBeenCalledWith({
      message:
        "Failed to apply the idle-in-transaction guard to a new Postgres connection.",
      metadata: {
        dependency: "postgres",
        errorCode: "42501",
        errorSeverity: "ERROR",
        isTransientConnectionTermination: false,
      },
      error: guardError,
    });
  });
});
