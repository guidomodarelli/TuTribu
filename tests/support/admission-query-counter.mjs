/** Test-only preload that counts native pg checkouts, transactions and statements per incoming HTTP request of a child Next server. @module admission-query-counter */
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";
import { Server } from "node:http";
import pg from "pg";

/** Message kind consumed by `withAdmissionNextServer`; no SQL text, parameters, rows or headers leave this process. */
const OBSERVATION_KIND = "admission_test_query_count";
/** Late statements of `after()` work still belong to the request that scheduled them. */
const SETTLE_AFTER_RESPONSE_MS = 750;
const TRANSACTION_STATEMENT = { begin: /^\s*begin\b/iu, commit: /^\s*commit\b/iu, rollback: /^\s*rollback\b/iu };
const requestScope = new AsyncLocalStorage();
/** Opt-in local diagnosis: appends only the statement's leading SQL shape (placeholders, never values) per request. */
const TRACE_PATH = process.env.ADMISSION_QUERY_COUNTER_TRACE;
const TRACE_SHAPE_LENGTH = 160;

/** @param intervals - Completed statement windows of one request. @returns The longest chain of statements that ran strictly one after another, which bounds the sequential database round trips. */
function longestSequentialChain(intervals) {
  const sorted = [...intervals].sort((left, right) => left.end - right.end), chain = [];
  for (let index = 0; index < sorted.length; index += 1) {
    let best = 0;
    for (let previous = 0; previous < index; previous += 1) if (sorted[previous].end <= sorted[index].start && chain[previous] > best) best = chain[previous];
    chain.push(best + 1);
  }
  return chain.reduce((maximum, length) => Math.max(maximum, length), 0);
}

/** @param config - Native pg query argument. @returns Only the statement class, never its text. */
function classify(config) {
  const text = typeof config === "string" ? config : typeof config?.text === "string" ? config.text : "";
  if (TRANSACTION_STATEMENT.begin.test(text)) return "begin";
  if (TRANSACTION_STATEMENT.commit.test(text)) return "commit";
  if (TRANSACTION_STATEMENT.rollback.test(text)) return "rollback";
  return "statement";
}

const originalQuery = pg.Client.prototype.query;
/** Delegates every call unchanged and records its window in the current request scope, if any. */
pg.Client.prototype.query = function countedQuery(config, values, callback) {
  const scope = requestScope.getStore();
  if (!scope) return originalQuery.call(this, config, values, callback);
  const kind = classify(config), window = { start: performance.now(), end: Number.NaN };
  scope.counts[kind] += 1;
  if (TRACE_PATH) scope.shapes.push((typeof config === "string" ? config : config?.text ?? "").replace(/\s+/gu, " ").trim().slice(0, TRACE_SHAPE_LENGTH));
  scope.intervals.push(window);
  const finish = () => { window.end = performance.now(); };
  const callbackIndex = [config, values, callback].findLastIndex((argument) => typeof argument === "function");
  if (callbackIndex >= 0) {
    const args = [config, values, callback], original = args[callbackIndex];
    args[callbackIndex] = function settledCallback(...result) { finish(); return original.apply(this, result); };
    return originalQuery.apply(this, args.slice(0, Math.max(callbackIndex + 1, arguments.length)));
  }
  const result = originalQuery.apply(this, arguments);
  if (result && typeof result.then === "function") result.then(finish, finish);
  else finish();
  return result;
};

const originalConnect = pg.Pool.prototype.connect;
/** Counts pool checkouts made inside a request scope and delegates unchanged. */
pg.Pool.prototype.connect = function countedConnect(...args) {
  const scope = requestScope.getStore();
  if (scope) scope.counts.checkouts += 1;
  return originalConnect.apply(this, args);
};

const originalEmit = Server.prototype.emit;
/** Opens one scope per incoming request and reports its aggregate once the response and late work settled. */
Server.prototype.emit = function scopedEmit(event, request, response) {
  if (event !== "request" || !request?.url || !response) return originalEmit.apply(this, arguments);
  const scope = { method: request.method, path: new URL(request.url, "http://counter.invalid").pathname, startedAt: performance.now(), counts: { checkouts: 0, begin: 0, commit: 0, rollback: 0, statement: 0 }, intervals: [], shapes: [] };
  response.once("close", () => {
    const durationMs = Math.round(performance.now() - scope.startedAt), status = response.statusCode;
    setTimeout(() => {
      const completed = scope.intervals.filter((window) => Number.isFinite(window.end));
      const { checkouts, begin, commit, rollback, statement } = scope.counts;
      if (TRACE_PATH) appendFileSync(TRACE_PATH, `${JSON.stringify({ method: scope.method, path: scope.path, shapes: scope.shapes })}\n`);
      process.send?.({ kind: OBSERVATION_KIND, method: scope.method, path: scope.path, status, durationMs, checkouts, transactions: begin, commits: commit, rollbacks: rollback, queries: begin + commit + rollback + statement, statements: statement, sequentialRoundTrips: longestSequentialChain(completed), pending: scope.intervals.length - completed.length });
    }, SETTLE_AFTER_RESPONSE_MS).unref();
  });
  const args = arguments;
  return requestScope.run(scope, () => originalEmit.apply(this, args));
};
