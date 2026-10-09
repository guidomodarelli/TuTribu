/** Guards exact import proposals without restoring consent or server authority. @module allowlist-import-browser-intent */
import { z } from "zod";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ALLOWLIST_IMPORT_FILE_NAME_CHARACTERS } from "../../constants/allowlist-import-browser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Stores one file copy; an unresolved preview locks it so the original body cannot drift. */
export const allowlistImportDraftSchema = z.strictObject({ draftId: z.uuid().optional(), fileName: z.string().max(ALLOWLIST_IMPORT_FILE_NAME_CHARACTERS), csvText: z.string().refine((text) => new TextEncoder().encode(text).byteLength <= ADMISSION_LIMIT.csvByteCount) });
/** Selects explicit source rows only, never a hidden or inferred select-all operation. */
export const allowlistImportSelectionSchema = z.array(z.int().min(1).max(ADMISSION_LIMIT.csvDataRowCount)).max(ADMISSION_LIMIT.csvDataRowCount).refine((rows) => new Set(rows).size === rows.length);
export const allowlistImportPreviewIntentSchema = z.strictObject({ type: z.literal(REAUTHENTICATION_OPERATION.previewAllowlistImport), operationId: z.uuid(), expectedPolicyVersion: z.int().positive(), contactType: z.enum(ADMISSION_CONTACT_TYPE) });
export const allowlistImportConfirmationIntentSchema = z.strictObject({ type: z.literal(REAUTHENTICATION_OPERATION.confirmAllowlistImport), operationId: z.uuid(), importId: z.uuid(), expectedVersion: z.int().positive(), selectedRows: allowlistImportSelectionSchema.refine((rows) => rows.length > 0) });
export const allowlistImportBrowserIntentSchema = z.discriminatedUnion("type", [allowlistImportPreviewIntentSchema, allowlistImportConfirmationIntentSchema]);
export type AllowlistImportDraft = z.infer<typeof allowlistImportDraftSchema>;
export type AllowlistImportBrowserIntent = z.infer<typeof allowlistImportBrowserIntentSchema>;
export type AllowlistImportConfirmationIntent = z.infer<typeof allowlistImportConfirmationIntentSchema>;
