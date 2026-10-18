/** @vitest-environment node */
/** Exercises the real pg pool and project logger without opening network connections. */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Pool } from "pg";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";

/** Own consumed protocol for deliberate guard failure; native Neon suites exercise real SQL. */
type ConnectionGuard = { onConnect: (client: { query: (...argumentsList: unknown[]) => Promise<unknown> }) => Promise<void> };

describe("Postgres pool factory", () => {
  const pools: Pool[] = [];
  const errorOutput = vi.fn();
  const warningOutput = vi.fn();

  beforeEach(() => {
    errorOutput.mockReset();
    warningOutput.mockReset();
    vi.spyOn(console, "error").mockImplementation(errorOutput);
    vi.spyOn(console, "warn").mockImplementation(warningOutput);
  });
  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
    vi.restoreAllMocks();
  });

  /** @param operation - Own diagnostic context. @returns A real unconnected pool tracked for cleanup. */
  function createPool(operation: string) {
    const pool = createPostgresPool({ connectionString: "postgres://user:secret@database.example.com/db", operation });
    pools.push(pool);
    return pool;
  }

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid owner capacity %s before inspecting connection credentials", (maximumConnections) => {
    let inspectedConnection = false;
    expect(() => createPostgresPool({
      operation: "owned_capacity_validation", maximumConnections,
      get connectionString() { inspectedConnection = true; return "unavailable_connection"; },
    })).toThrow("PostgresPool.create failed: maximum_connections_must_be_a_positive_integer");
    expect(inspectedConnection).toBe(false);
    expect(errorOutput).not.toHaveBeenCalled();
    expect(warningOutput).not.toHaveBeenCalled();
  });

  it("logs idle client termination through the real logger without exposing client connection details", () => {
    const pool = createPool("runtime_database_pool_idle_error");
    expect(pool.options).toMatchObject({
      allowExitOnIdle: true,
      connectionString: "postgres://user:secret@database.example.com/db",
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 5000,
      max: 100,
      maxLifetimeSeconds: 60,
      onConnect: expect.any(Function),
    });
    pool.emit("error", { code: "57P01", severity: "FATAL", message: "terminating connection due to administrator command" }, { connectionParameters: { host: "database.example.com", password: "secret" } });
    expect(warningOutput).toHaveBeenCalledTimes(1);
    const log = JSON.parse(String(warningOutput.mock.calls[0][0]));
    expect(log).toMatchObject({
      level: "warn", feature: "database", operation: "runtime_database_pool_idle_error", requestId: "background",
      message: "Postgres idle client was closed by the database backend.",
      metadata: { dependency: "postgres", errorCode: "57P01", errorSeverity: "FATAL", isTransientConnectionTermination: true },
      error: { message: "terminating connection due to administrator command" },
    });
    expect(errorOutput).not.toHaveBeenCalled();
    expect(log.metadata).not.toHaveProperty("client");
    expect(String(warningOutput.mock.calls[0][0])).not.toContain("database.example.com");
    expect(String(warningOutput.mock.calls[0][0])).not.toContain("secret");
    expect(pool.totalCount).toBe(0);
  });

  it("logs unexpected idle client errors through the real logger with safe metadata", () => {
    const pool = createPool("better_auth_database_pool_idle_error");
    pool.emit("error", { code: "08006", severity: "FATAL", message: "connection failure" }, undefined);
    expect(errorOutput).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(errorOutput.mock.calls[0][0]))).toMatchObject({
      level: "error", feature: "database", operation: "better_auth_database_pool_idle_error", requestId: "background",
      message: "Postgres idle client emitted an unexpected connection error.",
      metadata: { dependency: "postgres", errorCode: "08006", errorSeverity: "FATAL", isTransientConnectionTermination: false },
      error: { message: "connection failure" },
    });
    expect(warningOutput).not.toHaveBeenCalled();
  });

  it("applies the idle-in-transaction guard on every new connection", async () => {
    const pool = createPool("better_auth_database_pool_idle_error");
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const configuration = pool.options as unknown as ConnectionGuard;
    await expect(configuration.onConnect({ query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith("select set_config($1, $2, false)", ["idle_in_transaction_session_timeout", "30000"]);
    expect(warningOutput).not.toHaveBeenCalled();
    expect(errorOutput).not.toHaveBeenCalled();
  });

  it("rejects new connections when the idle-in-transaction guard cannot be applied", async () => {
    const pool = createPool("better_auth_database_pool_idle_error");
    const configuration = pool.options as unknown as ConnectionGuard;
    const guardError = Object.assign(new Error("set_config failed"), { code: "42501", severity: "ERROR" });
    await expect(configuration.onConnect({ query: vi.fn().mockRejectedValue(guardError) })).rejects.toBe(guardError);
    expect(warningOutput).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warningOutput.mock.calls[0][0]))).toMatchObject({
      level: "warn", feature: "database", operation: "better_auth_database_pool_idle_error", requestId: "background",
      message: "Failed to apply the idle-in-transaction guard to a new Postgres connection.",
      metadata: { dependency: "postgres", errorCode: "42501", errorSeverity: "ERROR", isTransientConnectionTermination: false },
      error: { name: "Error", message: "set_config failed" },
    });
  });
});
