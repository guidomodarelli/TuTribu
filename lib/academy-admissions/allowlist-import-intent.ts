"use client";
/** Persists one scoped file copy, explicit selection and original references without consent, results or credentials. @module allowlist-import-intent */
import { z } from "zod";
import { allowlistImportDraftSchema, allowlistImportBrowserIntentSchema, allowlistImportConfirmationIntentSchema, allowlistImportSelectionSchema } from "@/src/modules/academy-admissions/application/commands/allowlist-import-browser-intent";
import { ALLOWLIST_IMPORT_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AllowlistImportDraftStore } from "@/src/modules/academy-admissions/application/ports/allowlist-import-draft-store";
import { allowlistImportDraftStore } from "./allowlist-import-draft-store";

/** Previous uncertain confirmations retain their exact intent when explicitly resuming only pending rows. */
export const storedAllowlistImportSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), draft: allowlistImportDraftSchema.nullable(), importId: z.uuid().nullable(), selection: allowlistImportSelectionSchema, pending: allowlistImportBrowserIntentSchema.nullable(), unresolved: z.array(allowlistImportConfirmationIntentSchema) })
  .refine((stored) => [...stored.unresolved, ...(stored.pending?.type === REAUTHENTICATION_OPERATION.confirmAllowlistImport ? [stored.pending] : [])].every((intent) => intent.importId === stored.importId))
  .refine((stored) => new Set(stored.unresolved.map((intent) => intent.operationId)).size === stored.unresolved.length);
export type StoredAllowlistImport = z.infer<typeof storedAllowlistImportSchema>;
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** Metadata fits Web Storage; CSV bytes stay in the native large-data store. */
const storedReferenceSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), draft: z.strictObject({ draftId: z.uuid(), fileName: allowlistImportDraftSchema.shape.fileName }).nullable(), importId: z.uuid().nullable(), selection: allowlistImportSelectionSchema, pending: allowlistImportBrowserIntentSchema.nullable(), unresolved: z.array(allowlistImportConfirmationIntentSchema) });
/** @param viewerId - Native current viewer. @param slug - Current academy. @returns A private scoped storage key. */
function key(viewerId: string, slug: string): string { return `${ALLOWLIST_IMPORT_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`; }
/** @param viewerId - Native viewer to restore. @param slug - Current academy. @param storage - Metadata persistence boundary. @param files - Own large-data store. @param signal - Hydration cancellation. @returns Guarded proposals/references; a missing local file never discards its unresolved original. */
export async function readAllowlistImport(viewerId: string, slug: string, storage: StoragePort = window.sessionStorage, files: AllowlistImportDraftStore = allowlistImportDraftStore, signal = new AbortController().signal): Promise<StoredAllowlistImport | null> {
  const raw = storage.getItem(key(viewerId, slug));
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { storage.removeItem(key(viewerId, slug)); return null; }
  const parsed = storedReferenceSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug) { storage.removeItem(key(viewerId, slug)); return null; }
  const draft = parsed.data.draft ? await files.load(viewerId, slug, parsed.data.draft.draftId, signal) : null;
  if (signal.aborted) return null;
  return storedAllowlistImportSchema.parse({ ...parsed.data, draft });
}
/** @param value - One current scoped proposal and exact originals. @param storage - Persistence edge. @returns After storage succeeds; callers must stop a write when it fails. */
export function writeAllowlistImport(value: StoredAllowlistImport, storage: StoragePort = window.sessionStorage): void {
  const parsed = storedAllowlistImportSchema.parse(value);
  const metadata = storedReferenceSchema.parse({ ...parsed, draft: parsed.draft ? { draftId: parsed.draft.draftId, fileName: parsed.draft.fileName } : null });
  storage.setItem(key(value.viewerId, value.slug), JSON.stringify(metadata));
}
