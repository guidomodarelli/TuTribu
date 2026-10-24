/** Shares one in-flight read among the loaders of a single server render, never across requests. @module request-memo */
import "server-only";
import { cache } from "react";

/**
 * Returns the memo table of the current server render.
 *
 * `cache` gives every React server request its own table and discards it with the request.
 * Outside a render (route handlers, workers, tests) it does not memoize, so each call gets
 * a fresh table and the read runs again: the memo only ever removes duplicate work inside
 * one render and never carries a value to another request or user.
 */
const readRequestMemoTable = cache((): Map<string, Promise<unknown>> => new Map());

/**
 * Reuses the read already started for `key` in this render, or starts it.
 * @param key - Namespaced key; it must include every input the read depends on.
 * @param load - The original read, run at most once per render while it succeeds.
 * @returns The shared result. A rejected read is forgotten so a later caller retries it.
 */
export function memoizeForRequest<Result>(key: string, load: () => Promise<Result>): Promise<Result> {
  const table = readRequestMemoTable(), existing = table.get(key);
  if (existing) return existing as Promise<Result>;
  const started = load();
  table.set(key, started);
  started.catch(() => { if (table.get(key) === started) table.delete(key); });
  return started;
}
