/** Projects only leader-facing list metadata without owner identity, fingerprints or private storage columns. @module allowlist-query-schemas */
import { z } from "zod";
import type { AllowlistEntry } from "../../domain/entities/allowlist-entry";
import { allowlistEntrySchema } from "./admission-public-result-schemas";
import { ADMISSION_QUERY_LIMIT } from "../../constants/admission-public-contract";

/** The page has one entry point and a bounded opaque cursor; reads do not authorize admission. */
export const allowlistPageSchema = z.strictObject({ items: z.array(allowlistEntrySchema).max(ADMISSION_QUERY_LIMIT.maximumPageSize), nextCursor: z.string().max(ADMISSION_QUERY_LIMIT.cursorCharacters).nullable() });

/** @param entry - Current own entity after native leader authorization. @returns Guarded public metadata with actor/import/fingerprint details omitted. */
export function presentAllowlistEntry(entry: AllowlistEntry) {
  return allowlistEntrySchema.parse({ id: entry.id, version: entry.version, contactType: entry.contact.type, identity: entry.contact.value, displayName: entry.displayName, status: entry.status, source: entry.source, createdAt: entry.createdAt.toISOString(), updatedAt: entry.updatedAt.toISOString() });
}
