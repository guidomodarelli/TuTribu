/** Observes actual query awaits without retaining SQL, parameters, rows or native driver errors. */
import { performance } from "node:perf_hooks";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Reports the union of observed await intervals, including an unfinished statement when sampled. */
export type AdmissionTransactionObservation = {
  statementCount: number;
  pendingStatements: number;
  elapsedMs: number;
  observedAwaitMs: number;
  unobservedMs: number;
};

/** Delegates actual asynchronous work and exposes only its numeric observation. */
export type AdmissionStatementObserver = {
  observe: <Result>(work: () => Promise<Result>) => Promise<Result>;
  snapshot: () => AdmissionTransactionObservation;
};

/**
 * Counts overlapping awaits once and propagates the original result or rejection unchanged.
 * @param readMonotonicTime - Own monotonic clock; the default uses the actual Node runtime.
 * @param startedAt - Transaction entry before checkout, context preparation and commit.
 * @returns An isolated observer whose residual includes all work outside the observed statements.
 */
export function createAdmissionStatementObserver(readMonotonicTime: () => number = () => performance.now(), startedAt = readMonotonicTime()): AdmissionStatementObserver {
  let statementCount = 0, pendingStatements = 0, intervalStartedAt = startedAt, completedAwaitMs = 0;
  return {
    async observe<Result>(work: () => Promise<Result>): Promise<Result> {
      if (pendingStatements === 0) intervalStartedAt = readMonotonicTime();
      statementCount += 1;
      pendingStatements += 1;
      try { return await work(); }
      finally {
        pendingStatements -= 1;
        if (pendingStatements === 0) completedAwaitMs += readMonotonicTime() - intervalStartedAt;
      }
    },
    snapshot() {
      const now = readMonotonicTime();
      const elapsedMs = now - startedAt;
      const observedAwaitMs = completedAwaitMs + (pendingStatements > 0 ? now - intervalStartedAt : 0);
      return { statementCount, pendingStatements, elapsedMs, observedAwaitMs, unobservedMs: Math.max(0, elapsedMs - observedAwaitMs) };
    },
  };
}

/**
 * Delegates every execute call and its original result to the same native transaction.
 * @param database - Actual request-scoped Drizzle adapter supplied by the existing executor.
 * @param observer - Transaction-local await accounting; it never inspects arguments or rows.
 * @returns A view retaining the original adapter and all other operations.
 */
export function observeAdmissionDatabase(database: RequestDatabase, observer: AdmissionStatementObserver): RequestDatabase {
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "execute") return Reflect.get(target, property, receiver);
      return (...parameters: unknown[]) => observer.observe(() => Reflect.apply(target.execute, target, parameters));
    },
  });
}
