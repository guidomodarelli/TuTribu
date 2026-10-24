/** Owns static declared-number DTO fields separately from runtime flow composition. @module admission-whatsapp-number-schemas */
import { z } from "zod";
import { ADMISSION_WHATSAPP_CANONICAL_PATTERN } from "./admission-whatsapp-number";

/** Keeps old clients compatible without replacing an omitted current policy setting. */
export const admissionWhatsappPolicyFields = { requiresWhatsappNumber: z.boolean().optional() };
/** Only authorized current queries expose the canonical declared number. */
export const admissionWhatsappOwnRequestFields = {
  whatsappNumber: z.string().regex(ADMISSION_WHATSAPP_CANONICAL_PATTERN).nullable().optional(),
  ...admissionWhatsappPolicyFields,
};
/** Confirmed command history contains only resource/version lineage and no personal number. */
export const admissionWhatsappNumberResultSchema = z.object({ admissionRequestId: z.uuid(), version: z.int().positive(), changed: z.boolean() });
/** Stores the canonical original correction for explicit same-intent reconciliation. */
export const admissionWhatsappNumberBrowserInputSchema = z.strictObject({ operationId: z.uuid(), expectedVersion: z.int().positive(), confirmed: z.literal(true), whatsappNumber: z.string().regex(ADMISSION_WHATSAPP_CANONICAL_PATTERN).nullable() });
