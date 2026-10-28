import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const POSTGRES_POOL_METRICS_LOG = {
  feature: "database",
  message: "Postgres pool usage window.",
  operation: "postgres_pool_metrics",
  requestId: "background",
} as const;

/** Durations are logged with one decimal: finer precision is timer noise. */
const MILLISECONDS_ROUNDING_FACTOR = 10;

type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void
) => void;

type ConnectFunction = (callback?: ConnectCallback) => Promise<PoolClient> | void;

type AttachPostgresPoolMetricsInput = {
  pool: Pool;
  /** Label of the pool owner, logged so each runtime pool can be told apart. */
  poolOperation: string;
  maximumConnections: number;
  logIntervalMilliseconds: number;
};

/** Counters and peaks accumulated between two usage-window logs. */
type PostgresPoolUsageWindow = {
  checkouts: number;
  /** Checkouts requested while every connection was busy, so they had to queue. */
  queuedCheckouts: number;
  checkoutFailures: number;
  acquisitions: number;
  releases: number;
  errorReleases: number;
  connectionsOpened: number;
  connectionsRemoved: number;
  checkoutTotalMilliseconds: number;
  checkoutMaximumMilliseconds: number;
  queuedCheckoutMaximumMilliseconds: number;
  peakQueuedCheckouts: number;
  peakCheckedOutConnections: number;
  peakOpenConnections: number;
};

function createEmptyUsageWindow(): PostgresPoolUsageWindow {
  return {
    checkouts: 0,
    queuedCheckouts: 0,
    checkoutFailures: 0,
    acquisitions: 0,
    releases: 0,
    errorReleases: 0,
    connectionsOpened: 0,
    connectionsRemoved: 0,
    checkoutTotalMilliseconds: 0,
    checkoutMaximumMilliseconds: 0,
    queuedCheckoutMaximumMilliseconds: 0,
    peakQueuedCheckouts: 0,
    peakCheckedOutConnections: 0,
    peakOpenConnections: 0,
  };
}

function roundMilliseconds(milliseconds: number) {
  return Math.round(milliseconds * MILLISECONDS_ROUNDING_FACTOR) / MILLISECONDS_ROUNDING_FACTOR;
}

/** Pool being observed and the usage window currently being accumulated. */
type PoolMetricsState = {
  pool: Pool;
  maximumConnections: number;
  usageWindow: PostgresPoolUsageWindow;
  windowStartedAt: Date;
};

function readQueuedCheckouts(pool: Pool) {
  return Math.max(0, pool.waitingCount - pool.idleCount);
}

function readCheckedOutConnections(pool: Pool) {
  return pool.totalCount - pool.idleCount;
}

function observePeaks(state: PoolMetricsState) {
  const { pool, usageWindow } = state;
  usageWindow.peakQueuedCheckouts = Math.max(usageWindow.peakQueuedCheckouts, readQueuedCheckouts(pool));
  usageWindow.peakCheckedOutConnections = Math.max(usageWindow.peakCheckedOutConnections, readCheckedOutConnections(pool));
  usageWindow.peakOpenConnections = Math.max(usageWindow.peakOpenConnections, pool.totalCount);
}

/**
 * Counts a checkout request and returns the callback that records how it ended.
 *
 * @param state - Observed pool and current window.
 * @returns Idempotent callback taking the checkout error, if any.
 */
function beginCheckout(state: PoolMetricsState) {
  const { pool, maximumConnections } = state;
  const startedAt = performance.now();
  const queued = pool.totalCount >= maximumConnections && pool.idleCount <= pool.waitingCount;
  state.usageWindow.checkouts += 1;
  if (queued) state.usageWindow.queuedCheckouts += 1;
  let finished = false;
  return (error: unknown) => {
    if (finished) return;
    finished = true;
    const { usageWindow } = state;
    const elapsedMilliseconds = performance.now() - startedAt;
    usageWindow.checkoutTotalMilliseconds += elapsedMilliseconds;
    usageWindow.checkoutMaximumMilliseconds = Math.max(usageWindow.checkoutMaximumMilliseconds, elapsedMilliseconds);
    if (queued) {
      usageWindow.queuedCheckoutMaximumMilliseconds = Math.max(usageWindow.queuedCheckoutMaximumMilliseconds, elapsedMilliseconds);
    }
    if (error) usageWindow.checkoutFailures += 1;
    observePeaks(state);
  };
}

/**
 * Wraps `pool.connect` (callback and promise forms) to time every checkout.
 *
 * @param state - Observed pool and current window.
 */
function instrumentConnect(state: PoolMetricsState) {
  const { pool } = state;
  const originalConnect = pool.connect.bind(pool) as ConnectFunction;
  const instrumentedConnect: ConnectFunction = (callback) => {
    const finishCheckout = beginCheckout(state);
    if (typeof callback === "function") {
      const result = originalConnect((error, client, done) => {
        finishCheckout(error);
        callback(error, client, done);
      });
      observePeaks(state);
      return result;
    }
    const checkout = originalConnect() as Promise<PoolClient>;
    observePeaks(state);
    return checkout.then(
      (client) => {
        finishCheckout(undefined);
        return client;
      },
      (error: unknown) => {
        finishCheckout(error);
        throw error;
      }
    );
  };
  pool.connect = instrumentedConnect as Pool["connect"];
}

/**
 * Counts the pool connection events in the current window.
 *
 * @param state - Observed pool and current window.
 */
function countPoolEvents(state: PoolMetricsState) {
  const { pool } = state;
  pool.on("connect", () => { state.usageWindow.connectionsOpened += 1; });
  pool.on("remove", () => { state.usageWindow.connectionsRemoved += 1; });
  pool.on("acquire", () => {
    state.usageWindow.acquisitions += 1;
    observePeaks(state);
  });
  pool.on("release", (error: unknown) => {
    state.usageWindow.releases += 1;
    if (error) state.usageWindow.errorReleases += 1;
  });
}

/**
 * Builds the callback that closes the current window and logs it, when the pool was in use.
 *
 * @param state - Observed pool and current window.
 * @param input - Pool owner label.
 * @returns Callback run on every interval and when the pool ends.
 */
function createUsageWindowLogger(state: PoolMetricsState, input: AttachPostgresPoolMetricsInput) {
  const { pool, maximumConnections } = state;
  const poolInstanceId = randomUUID();
  const logger = createServerLogger({
    feature: POSTGRES_POOL_METRICS_LOG.feature,
    operation: POSTGRES_POOL_METRICS_LOG.operation,
    requestId: POSTGRES_POOL_METRICS_LOG.requestId,
  });

  return () => {
    const usageWindow = state.usageWindow;
    const checkedOutConnections = readCheckedOutConnections(pool);
    const queuedCheckouts = readQueuedCheckouts(pool);
    // A checkout that started in an earlier window can finish (or fail) in this one, so its completion counts as activity.
    const hadActivity = usageWindow.checkouts > 0 || usageWindow.acquisitions > 0 || usageWindow.checkoutFailures > 0 || usageWindow.releases > 0 || usageWindow.connectionsOpened > 0 || usageWindow.connectionsRemoved > 0;
    if (!hadActivity && checkedOutConnections === 0 && queuedCheckouts === 0) return;
    // Sample before closing so occupancy held through the whole window still counts as its peak.
    observePeaks(state);
    const closedWindow = state.usageWindow;
    const closedWindowStartedAt = state.windowStartedAt;
    state.usageWindow = createEmptyUsageWindow();
    state.windowStartedAt = new Date();
    // Seed the next window with the occupancy it inherits, even if no checkout happens in it.
    observePeaks(state);
    logger.info({
      message: POSTGRES_POOL_METRICS_LOG.message,
      metadata: {
        poolOperation: input.poolOperation,
        poolInstanceId,
        maximumConnections,
        windowStartedAt: closedWindowStartedAt.toISOString(),
        windowEndedAt: state.windowStartedAt.toISOString(),
        ...closedWindow,
        checkoutTotalMilliseconds: roundMilliseconds(closedWindow.checkoutTotalMilliseconds),
        checkoutMaximumMilliseconds: roundMilliseconds(closedWindow.checkoutMaximumMilliseconds),
        queuedCheckoutMaximumMilliseconds: roundMilliseconds(closedWindow.queuedCheckoutMaximumMilliseconds),
        openConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        checkedOutConnections,
        queuedCheckoutsNow: queuedCheckouts,
      },
    });
  };
}

/**
 * Instruments a pool with in-memory usage counters and logs one structured
 * window per interval while the pool is in use. Only counts, durations and
 * pool gauges are logged: never connection strings, hosts, SQL or row data.
 *
 * A checkout counts as queued when, at request time, the pool had reached its
 * maximum and had no idle connection left for it. Checkout durations include
 * opening a new connection (TLS and the idle-in-transaction guard) when the
 * pool had room to grow.
 *
 * Ending the pool stops the interval and logs the last window.
 *
 * @param input - Pool to observe, its owner label, its capacity and the log interval.
 */
export function attachPostgresPoolMetrics(input: AttachPostgresPoolMetricsInput) {
  const { pool, maximumConnections } = input;
  const state: PoolMetricsState = {
    pool,
    maximumConnections,
    usageWindow: createEmptyUsageWindow(),
    windowStartedAt: new Date(),
  };

  instrumentConnect(state);
  countPoolEvents(state);

  const logUsageWindow = createUsageWindowLogger(state, input);
  const interval = setInterval(logUsageWindow, input.logIntervalMilliseconds);
  interval.unref();

  const originalEnd = pool.end.bind(pool) as (callback?: () => void) => Promise<void> | void;
  const instrumentedEnd = (callback?: () => void) => {
    clearInterval(interval);
    logUsageWindow();
    return originalEnd(callback);
  };
  pool.end = instrumentedEnd as Pool["end"];
}
