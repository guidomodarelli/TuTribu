/** Defines authorized leader configuration/import DTOs without provider or row validation. @module admission-management-result-schemas */
import { z } from "zod";
import { ADMISSION_POLICY_MODE, ADMISSION_PHONE_CHANNEL, ADMISSION_POLICY_CONFIGURATION_ERROR } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_IMPORT_ROW_OUTCOME, ADMISSION_IMPORT_PUBLIC_STATE } from "@/src/modules/academy-admissions/constants/admission-management-contract";
import { ADMISSION_INPUT_CATEGORY } from "@/src/modules/academy-admissions/constants/admission-resources";
import { admissionPublicIdSchema, admissionPublicVersionSchema, admissionPublicInstantSchema } from "./admission-contract-fields";

/** Leader policy data has separate counters and only derived country facts, not another editable country list. */
export const admissionPolicySchema = z.object({
  id: admissionPublicIdSchema, version: admissionPublicVersionSchema, verificationEpoch: admissionPublicVersionSchema,
  mode: z.enum(ADMISSION_POLICY_MODE), contactType: z.enum(ADMISSION_CONTACT_TYPE), isOpen: z.boolean(), allowCommonExceptions: z.boolean(), requiresAdditionalVerification: z.boolean(),
  phoneChannel: z.enum(ADMISSION_PHONE_CHANNEL).nullable(), allowSmsAlternative: z.boolean(), activatedAt: admissionPublicInstantSchema.nullable(),
  messagingConnectionId: admissionPublicIdSchema.nullable(), messagingConnectionVersion: admissionPublicVersionSchema.nullable(),
  usage: z.object({ version: admissionPublicVersionSchema, allowedCountries: z.array(z.string()) }).nullable(),
  requirements: z.array(z.enum(ADMISSION_POLICY_CONFIGURATION_ERROR)),
}).refine((policy) => (policy.messagingConnectionId === null) === (policy.messagingConnectionVersion === null));

/** Preview rows preserve entered data for the same leader but never include fingerprints or bindings. */
const importRowSchema = z.object({ rowNumber: z.int().min(1).max(ADMISSION_LIMIT.csvDataRowCount), identity: z.string(), displayName: z.string().max(ADMISSION_LIMIT.displayNameCharacters).nullable().optional(), selected: z.boolean(), errors: z.array(z.enum(ADMISSION_INPUT_CATEGORY)), outcome: z.enum(ADMISSION_IMPORT_ROW_OUTCOME).optional(), version: admissionPublicVersionSchema.optional() });
/** The preview is bounded and indexed by explicit source rows; it cannot claim duplicate confirmed work. */
export const allowlistImportSchema = z.object({
  importId: admissionPublicIdSchema, state: z.enum(ADMISSION_IMPORT_PUBLIC_STATE), expiresAt: admissionPublicInstantSchema,
  sourceVersion: admissionPublicVersionSchema, rows: z.array(importRowSchema).max(ADMISSION_LIMIT.csvDataRowCount),
  counts: z.object({ selected: z.int().nonnegative(), added: z.int().nonnegative(), unchanged: z.int().nonnegative(), skipped: z.int().nonnegative(), conflict: z.int().nonnegative() }),
}).refine((preview) => new Set(preview.rows.map((row) => row.rowNumber)).size === preview.rows.length
  && preview.counts.selected === preview.rows.filter((row) => row.selected).length
  && Object.values(ADMISSION_IMPORT_ROW_OUTCOME).every((outcome) => preview.counts[outcome] === preview.rows.filter((row) => row.outcome === outcome).length)
  && (preview.state !== ADMISSION_IMPORT_PUBLIC_STATE.preview || preview.rows.every((row) => row.outcome === undefined && row.version === undefined))
  && (preview.state !== ADMISSION_IMPORT_PUBLIC_STATE.completed || preview.rows.every((row) => !row.selected || row.outcome !== undefined)));

/** Public props/response/browser types belong to application, not SQL or SDK DTOs. */
export type AdmissionPolicyDto = z.infer<typeof admissionPolicySchema>;
export type AllowlistImportDto = z.infer<typeof allowlistImportSchema>;
