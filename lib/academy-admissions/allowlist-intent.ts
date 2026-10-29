"use client";
/** Persists only the current viewer/tribe draft and exact pending list command, never consent or credentials. @module allowlist-intent */
import { z } from "zod";
import { allowlistDraftSchema, allowlistBrowserIntentSchema } from "@/src/modules/academy-admissions/application/commands/allowlist-browser-intent";
import { buildScopedIntentKey, readScopedIntentRecord, type ScopedIntentStorage } from "@/lib/scoped-intent-storage";
import { ALLOWLIST_BROWSER_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/allowlist-browser";

const storedSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), draft: allowlistDraftSchema, pending: allowlistBrowserIntentSchema.nullable() });
export type StoredAllowlistWorkflow = z.infer<typeof storedSchema>;
type StoragePort = ScopedIntentStorage;
const key = (viewerId: string, slug: string) => buildScopedIntentKey(ALLOWLIST_BROWSER_STORAGE_PREFIX, viewerId, slug);
/** @param viewerId - Native current viewer. @param slug - Current tribe. @param storage - Browser persistence edge. @returns Only owned valid data; corrupted data is removed. */
export function readAllowlistWorkflow(viewerId: string, slug: string, storage: StoragePort = window.sessionStorage): StoredAllowlistWorkflow | null {
  return readScopedIntentRecord(storedSchema, { viewerId, slug }, key(viewerId, slug), storage);
}
/** @param value - Scoped draft and original command. @param storage - Browser persistence edge. @returns After writing; unavailable storage blocks a new mutation. */
export function writeAllowlistWorkflow(value: StoredAllowlistWorkflow, storage: StoragePort = window.sessionStorage): void {
  storage.setItem(key(value.viewerId, value.slug), JSON.stringify(storedSchema.parse(value)));
}
