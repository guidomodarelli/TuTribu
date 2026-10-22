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
  const poolInstanceId = randomUUID();
  const logger = createServerLogger({
    feature: POSTGRES_POOL_METRICS_LOG.feature,
    operation: POSTGRES_POOL_METRICS_LOG.operation,
    requestId: POSTGRES_POOL_METRICS_LOG.requestId,
  });
  let usageWindow = createEmptyUsageWindow();
  let windowStartedAt = new Date();

  const readQueuedCheckouts = () => Math.max(0, pool.waitingCount - pool.idleCount);
  const readCheckedOutConnections = () => pool.totalCount - pool.idleCount;
  const observePeaks = () => {
    usageWindow.peakQueuedCheckouts = Math.max(usageWindow.peakQueuedCheckouts, readQueuedCheckouts());
    usageWindow.peakCheckedOutConnections = Math.max(usageWindow.peakCheckedOutConnections, readCheckedOutConnections());
    usageWindow.peakOpenConnections = Math.max(usageWindow.peakOpenConnections, pool.totalCount);
  };

  const beginCheckout = () => {
    const startedAt = performance.now();
    const queued = pool.totalCount >= maximumConnections && pool.idleCount <= pool.waitingCount;
    usageWindow.checkouts += 1;
    if (queued) usageWindow.queuedCheckouts += 1;
    let finished = false;
    return (error: unknown) => {
      if (finished) return;
      finished = true;
      const elapsedMilliseconds = performance.now() - startedAt;
      usageWindow.checkoutTotalMilliseconds += elapsedMilliseconds;
      usageWindow.checkoutMaximumMilliseconds = Math.max(usageWindow.checkoutMaximumMilliseconds, elapsedMilliseconds);
      if (queued) {
        usageWindow.queuedCheckoutMaximumMilliseconds = Math.max(usageWindow.queuedCheckoutMaximumMilliseconds, elapsedMilliseconds);
      }
      if (error) usageWindow.checkoutFailures += 1;
      observePeaks();
    };
  };

  const originalConnect = pool.connect.bind(pool) as ConnectFunction;
  const instrumentedConnect: ConnectFunction = (callback) => {
    const finishCheckout = beginCheckout();
    if (typeof callback === "function") {
      const result = originalConnect((error, client, done) => {
        finishCheckout(error);
        callback(error, client, done);
      });
      observePeaks();
      return result;
    }
    const checkout = originalConnect() as Promise<PoolClient>;
    observePeaks();
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

  pool.on("connect", () => { usageWindow.connectionsOpened += 1; });
  pool.on("remove", () => { usageWindow.connectionsRemoved += 1; });
  pool.on("acquire", () => {
    usageWindow.acquisitions += 1;
    observePeaks();
  });
  pool.on("release", (error: unknown) => {
    usageWindow.releases += 1;
    if (error) usageWindow.errorReleases += 1;
  });

  const logUsageWindow = () => {
    const checkedOutConnections = readCheckedOutConnections();
    const queuedCheckouts = readQueuedCheckouts();
    const hadActivity = usageWindow.checkouts > 0 || usageWindow.releases > 0 || usageWindow.connectionsRemoved > 0;
    if (!hadActivity && checkedOutConnections === 0 && queuedCheckouts === 0) return;
    const closedWindow = usageWindow;
    const closedWindowStartedAt = windowStartedAt;
    usageWindow = createEmptyUsageWindow();
    windowStartedAt = new Date();
    logger.info({
      message: POSTGRES_POOL_METRICS_LOG.message,
      metadata: {
        poolOperation: input.poolOperation,
        poolInstanceId,
        maximumConnections,
        windowStartedAt: closedWindowStartedAt.toISOString(),
        windowEndedAt: windowStartedAt.toISOString(),
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
