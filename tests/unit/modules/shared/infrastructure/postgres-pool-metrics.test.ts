/** @vitest-environment node */
/**
 * Exercises the real pg pool queue with the pool's documented `Client` option: an in-memory
 * client stands in for the network connection, so checkout, queueing and release run through
 * the real pg-pool code without opening sockets.
 */
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";
import { attachPostgresPoolMetrics } from "@/src/modules/shared/infrastructure/database/postgres-pool-metrics";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";

const METRICS_INTERVAL_ENV = "POSTGRES_POOL_METRICS_LOG_INTERVAL_MS";
const METRICS_MESSAGE = "Postgres pool usage window.";

/** Minimal connection accepted by pg-pool: connects and ends asynchronously, never touches the network. */
class InMemoryClient extends EventEmitter {
  _queryable = true;
  _ending = false;
  connect(callback: (error?: Error) => void) { setImmediate(() => callback()); }
  isConnected() { return !this._ending; }
  ref() { /* no socket to keep alive */ }
  unref() { /* no socket to release */ }
  end(callback?: () => void) {
    this._ending = true;
    setImmediate(() => { this.emit("end"); callback?.(); });
  }
}

/** Connection that stays pending until the test lets it fail, to span a logging boundary. */
class DeferredFailingClient extends InMemoryClient {
  static failPending: () => void = () => undefined;
  connect(callback: (error?: Error) => void) {
    DeferredFailingClient.failPending = () => callback(new Error("synthetic connection failure"));
  }
}

/** @returns A port that was free a moment ago and now refuses connections. */
async function reserveClosedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("reserveClosedPort failed: no TCP address");
  return address.port;
}

describe("Postgres pool usage metrics", () => {
  const infoOutput = vi.fn();
  const originalInterval = process.env[METRICS_INTERVAL_ENV];

  beforeEach(() => {
    infoOutput.mockReset();
    vi.spyOn(console, "info").mockImplementation(infoOutput);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalInterval === undefined) delete process.env[METRICS_INTERVAL_ENV];
    else process.env[METRICS_INTERVAL_ENV] = originalInterval;
  });

  /** @returns Parsed metrics log entries written so far. */
  function readMetricsLogs() {
    return infoOutput.mock.calls
      .map(([line]) => JSON.parse(String(line)))
      .filter((entry) => entry.message === METRICS_MESSAGE);
  }

  /** @returns A real pool of one connection backed by in-memory clients and observed by the metrics. */
  function createObservedPool() {
    const pool = new Pool({ max: 1, Client: InMemoryClient as unknown as never });
    attachPostgresPoolMetrics({ pool, poolOperation: "runtime_database_pool_idle_error", maximumConnections: 1, logIntervalMilliseconds: 1000 });
    return pool;
  }

  it("counts acquisitions, queued checkouts and releases through the real pool queue", async () => {
    const pool = createObservedPool();
    const first = await pool.connect();
    const second = pool.connect();
    first.release();
    const secondClient = await second;
    secondClient.release(new Error("synthetic broken connection"));
    await new Promise((resolve) => pool.once("remove", resolve));
    await pool.end();

    const [usageWindow] = readMetricsLogs();
    expect(usageWindow).toMatchObject({
      level: "info", feature: "database", operation: "postgres_pool_metrics", requestId: "background",
      metadata: {
        poolOperation: "runtime_database_pool_idle_error", maximumConnections: 1,
        checkouts: 2, queuedCheckouts: 1, checkoutFailures: 0,
        acquisitions: 2, releases: 2, errorReleases: 1,
        connectionsOpened: 1, connectionsRemoved: 1,
        peakQueuedCheckouts: 1, peakCheckedOutConnections: 1, peakOpenConnections: 1,
        checkedOutConnections: 0, queuedCheckoutsNow: 0,
      },
    });
    expect(usageWindow.metadata.queuedCheckoutMaximumMilliseconds).toBeGreaterThanOrEqual(0);
    expect(usageWindow.metadata.checkoutMaximumMilliseconds).toBeGreaterThanOrEqual(usageWindow.metadata.queuedCheckoutMaximumMilliseconds);
    expect(usageWindow.metadata.poolInstanceId).toEqual(expect.any(String));
  });

  it("logs one window per interval only while the pool has activity", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const pool = createObservedPool();
    const client = await pool.connect();
    vi.advanceTimersByTime(1000);
    expect(readMetricsLogs()).toHaveLength(1);
    expect(readMetricsLogs()[0].metadata).toMatchObject({ checkouts: 1, checkedOutConnections: 1 });

    client.release();
    vi.advanceTimersByTime(1000);
    expect(readMetricsLogs()).toHaveLength(2);
    expect(readMetricsLogs()[1].metadata).toMatchObject({ checkouts: 0, releases: 1, checkedOutConnections: 0 });

    vi.advanceTimersByTime(1000);
    expect(readMetricsLogs()).toHaveLength(2);
    await pool.end();
  });

  it("reports occupancy held across windows as each window's peak", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const pool = createObservedPool();
    const client = await pool.connect();
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    const [, heldWindow] = readMetricsLogs();
    expect(heldWindow.metadata).toMatchObject({ checkouts: 0, checkedOutConnections: 1, peakCheckedOutConnections: 1, peakOpenConnections: 1 });
    client.release();
    await pool.end();
  });

  it("logs a checkout failure that completes after the window that counted its checkout", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const pool = new Pool({ max: 1, Client: DeferredFailingClient as unknown as never });
    attachPostgresPoolMetrics({ pool, poolOperation: "runtime_database_pool_idle_error", maximumConnections: 1, logIntervalMilliseconds: 1000 });
    const checkout = pool.connect();
    vi.advanceTimersByTime(1000);
    expect(readMetricsLogs()[0].metadata).toMatchObject({ checkouts: 1, checkoutFailures: 0 });

    DeferredFailingClient.failPending();
    await expect(checkout).rejects.toThrow("synthetic connection failure");
    vi.advanceTimersByTime(1000);
    expect(readMetricsLogs()).toHaveLength(2);
    expect(readMetricsLogs()[1].metadata).toMatchObject({ checkouts: 0, checkoutFailures: 1, checkedOutConnections: 0 });
    await pool.end();
  });

  it("counts failed checkouts from createPostgresPool without logging connection details", async () => {
    process.env[METRICS_INTERVAL_ENV] = "60000";
    const port = await reserveClosedPort();
    const pool = createPostgresPool({ connectionString: `postgres://user:secret@127.0.0.1:${port}/db`, operation: "runtime_database_pool_idle_error" });
    await expect(pool.connect()).rejects.toThrow();
    await expect(pool.query("select 1")).rejects.toThrow();
    await pool.end();

    const logs = readMetricsLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({ checkouts: 2, checkoutFailures: 2, acquisitions: 0, queuedCheckouts: 0, maximumConnections: 100 });
    const output = infoOutput.mock.calls.map(([line]) => String(line)).join("\n");
    expect(output).not.toContain("secret");
    expect(output).not.toContain(String(port));
  });

  it("stays silent when the interval is not configured", async () => {
    delete process.env[METRICS_INTERVAL_ENV];
    const port = await reserveClosedPort();
    const pool = createPostgresPool({ connectionString: `postgres://user:secret@127.0.0.1:${port}/db`, operation: "runtime_database_pool_idle_error" });
    await expect(pool.connect()).rejects.toThrow();
    await pool.end();
    expect(readMetricsLogs()).toHaveLength(0);
  });
});
