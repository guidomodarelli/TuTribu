/** Guards minimal original import snapshots independently of current rows or private file context. @module allowlist-import-operation-schemas */
import { z } from "zod";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ALLOWLIST_IMPORT_DENIAL } from "../../constants/allowlist-import";
import { ADMISSION_IMPORT_PUBLIC_STATE } from "../../constants/admission-management-contract";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import type { AllowlistImportReference, AllowlistImportConfirmationResult } from "../../domain/repositories/allowlist-import-repository";

export const allowlistImportReferenceSchema = z.strictObject({ importId: z.uuid(), sourceVersion: z.int().positive(), expiresAt: z.iso.datetime({ offset: true }) }) satisfies z.ZodType<AllowlistImportReference>;
export const allowlistImportConfirmationResultSchema = z.strictObject({ importId: z.uuid(), sourceVersion: z.int().positive(), state: z.enum(ADMISSION_IMPORT_PUBLIC_STATE), counts: z.strictObject({ selected: z.int().nonnegative().max(ADMISSION_LIMIT.csvDataRowCount), added: z.int().nonnegative(), unchanged: z.int().nonnegative(), skipped: z.int().nonnegative(), conflict: z.int().nonnegative() }) }).refine((value) => value.counts.added + value.counts.unchanged + value.counts.conflict <= value.counts.selected && value.counts.added + value.counts.unchanged + value.counts.skipped + value.counts.conflict <= ADMISSION_LIMIT.csvDataRowCount) satisfies z.ZodType<AllowlistImportConfirmationResult>;
/** A recorded known rejection cannot invent an import id or version-zero preview. */
export const allowlistImportDenialSchema = z.strictObject({ outcome: z.literal(ALLOWLIST_IMPORT_DENIAL), code: z.enum([ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.resourceUnavailable, ADMISSION_ERROR_CODE.policyConflict, ADMISSION_ERROR_CODE.allowlistImportConflict]) });
export const allowlistImportPreviewSnapshotSchema = z.union([allowlistImportReferenceSchema, allowlistImportDenialSchema]);
export const allowlistImportConfirmationSnapshotSchema = z.union([allowlistImportConfirmationResultSchema, allowlistImportDenialSchema]);
