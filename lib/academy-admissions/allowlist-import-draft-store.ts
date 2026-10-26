"use client";
/** Stores CSV data in native IndexedDB so the product's five-MiB input fits without duplicating it into Web Storage. @module allowlist-import-draft-store-adapter */
import { z } from "zod";
import { allowlistImportDraftSchema } from "@/src/modules/academy-admissions/application/commands/allowlist-import-browser-intent";
import type { AllowlistImportDraftStore } from "@/src/modules/academy-admissions/application/ports/allowlist-import-draft-store";
import { ALLOWLIST_IMPORT_DRAFT_DATABASE, ALLOWLIST_IMPORT_DRAFT_DATABASE_VERSION, ALLOWLIST_IMPORT_DRAFT_STORE, ALLOWLIST_IMPORT_DRAFT_EXPIRATION_INDEX } from "@/src/modules/academy-admissions/constants/allowlist-import-draft";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { newAdmissionOperationId } from "./admission-draft";

const recordSchema = z.strictObject({ id: z.uuid(), viewerId: z.string().min(1), slug: z.string().min(1), expiresAt: z.int().positive(), draft: allowlistImportDraftSchema });
/** @param signal - Current upload/hydration scope. @returns One native handle or a controlled local storage failure; late open handles are always closed. */
function openDatabase(signal: AbortSignal): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (signal.aborted || typeof indexedDB === "undefined") { reject(new Error("Import draft storage is unavailable")); return; }
    const request = indexedDB.open(ALLOWLIST_IMPORT_DRAFT_DATABASE, ALLOWLIST_IMPORT_DRAFT_DATABASE_VERSION);
    let cancelled = false;
    const abort = () => { cancelled = true; reject(new Error("Import draft storage scope was cancelled")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    request.onupgradeneeded = () => { const store = request.result.createObjectStore(ALLOWLIST_IMPORT_DRAFT_STORE, { keyPath: "id" }); store.createIndex(ALLOWLIST_IMPORT_DRAFT_EXPIRATION_INDEX, "expiresAt"); };
    request.onerror = () => { cleanup(); reject(new Error("Import draft database could not open")); };
    request.onblocked = () => { cancelled = true; cleanup(); reject(new Error("Import draft database upgrade is blocked")); };
    request.onsuccess = () => { cleanup(); const database = request.result; database.onversionchange = () => database.close(); if (signal.aborted || cancelled) { database.close(); reject(new Error("Import draft database opened after cancellation")); } else resolve(database); };
  });
}
/** @param mode - Native local read/write transaction mode. @param signal - Scope cancellation. @param perform - One owned file operation. @returns Only after its real transaction commits; aborted work closes its handle. */
async function transact<Value>(mode: IDBTransactionMode, signal: AbortSignal, perform: (store: IDBObjectStore, publish: (value: Value) => void) => void): Promise<Value> {
  const database = await openDatabase(signal);
  try {
    return await new Promise<Value>((resolve, reject) => {
      const transaction = database.transaction(ALLOWLIST_IMPORT_DRAFT_STORE, mode);
      let value: Value;
      const abort = () => { try { transaction.abort(); } catch { /* A completed local transaction cannot be aborted. */ } };
      const cleanup = () => signal.removeEventListener("abort", abort);
      transaction.oncomplete = () => { cleanup(); resolve(value); };
      transaction.onerror = () => { cleanup(); reject(new Error("Import draft transaction failed")); };
      transaction.onabort = () => { cleanup(); reject(new Error("Import draft transaction was cancelled")); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      try { perform(transaction.objectStore(ALLOWLIST_IMPORT_DRAFT_STORE), (result) => { value = result; }); } catch { abort(); }
    });
  } finally { database.close(); }
}
/** Stores input only; metadata references are session-scoped and every load rechecks owner and retention. */
export const allowlistImportDraftStore: AllowlistImportDraftStore = {
  save: async (viewerId, slug, draft, signal) => {
    const id = newAdmissionOperationId(), now = Date.now(), record = recordSchema.parse({ id, viewerId, slug, expiresAt: now + ADMISSION_LIMIT.csvRetentionMs, draft: { fileName: draft.fileName, csvText: draft.csvText } });
    await transact<void>("readwrite", signal, (store, publish) => {
      const cursor = store.index(ALLOWLIST_IMPORT_DRAFT_EXPIRATION_INDEX).openCursor(IDBKeyRange.upperBound(now));
      cursor.onsuccess = () => { const expired = cursor.result; if (expired) { expired.delete(); expired.continue(); } };
      store.put(record); publish(undefined);
    });
    return { ...record.draft, draftId: id };
  },
  load: async (viewerId, slug, draftId, signal) => {
    const value = await transact<unknown>("readonly", signal, (store, publish) => { const request = store.get(draftId); request.onsuccess = () => publish(request.result); });
    const parsed = recordSchema.safeParse(value);
    if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug || parsed.data.id !== draftId) return null;
    if (parsed.data.expiresAt <= Date.now()) { await allowlistImportDraftStore.remove(draftId); return null; }
    return { ...parsed.data.draft, draftId: parsed.data.id };
  },
  remove: async (draftId) => { await transact<void>("readwrite", new AbortController().signal, (store, publish) => { store.delete(draftId); publish(undefined); }); },
};
