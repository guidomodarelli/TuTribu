/** @jest-environment node */

describe("Postgres pool factory", () => {
  const loggerError = jest.fn();
  const loggerWarn = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    loggerError.mockReset();
    loggerWarn.mockReset();
  });

  it("logs idle client termination errors without exposing client connection details", async () => {
    const poolOn = jest.fn();
    const poolInstance = {
      on: poolOn,
    };
    const Pool = jest.fn(() => poolInstance);

    jest.doMock("pg", () => ({
      Pool,
    }));
    jest.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: () => ({
          error: loggerError,
          info: jest.fn(),
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
    const poolOn = jest.fn();

    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({
        on: poolOn,
      })),
    }));
    jest.doMock(
      "@/src/modules/shared/infrastructure/observability/server-logger",
      () => ({
        createServerLogger: () => ({
          error: loggerError,
          info: jest.fn(),
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
    });

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
});
