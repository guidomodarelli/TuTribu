/** Validates only untrusted own browser recovery records and explicit confirmation input. @module admission-review-intent-schemas */
import { z } from "zod";
import type { AdmissionBatchReviewIntent, AdmissionReviewIntent, AdmissionStoredReviewIntent } from "../application/results/admission-review-intent";
import { ADMISSION_DECISION } from "./admission-public-contract";
import { ADMISSION_LIMIT } from "./admission-limits";
import { ADMISSION_BATCH_DECISION_OPERATION } from "./admission-batch-decision";

/** Preserves the existing individual intent's fields and normalization. */
const admissionReviewDecisionInputSchema = z.strictObject({ operationId: z.uuid(), confirmed: z.literal(true), expectedVersion: z.int().positive(), decision: z.enum(ADMISSION_DECISION), internalReason: z.string().trim().max(ADMISSION_LIMIT.internalMessageCharacters), externalMessage: z.string().trim().max(ADMISSION_LIMIT.externalMessageCharacters).optional() });
export const admissionReviewIntentSchema = z.object({ requestId: z.uuid(), input: admissionReviewDecisionInputSchema }) satisfies z.ZodType<AdmissionReviewIntent>;
/** The named manifest is local; only its ids and versions are sent to the atomic owner. */
export const admissionBatchReviewIntentSchema = z.strictObject({
  kind: z.literal(ADMISSION_BATCH_DECISION_OPERATION),
  selection: z.array(z.strictObject({ requestId: z.uuid().transform((id) => id.toLowerCase()), expectedVersion: z.int().positive(), applicantName: z.string().trim().min(1) })).min(1).max(ADMISSION_LIMIT.batchRequestCount),
  input: admissionReviewDecisionInputSchema.omit({ expectedVersion: true }),
}).refine((intent) => new Set(intent.selection.map((item) => item.requestId)).size === intent.selection.length) satisfies z.ZodType<AdmissionBatchReviewIntent>;
/** Old individual records remain valid within the same single recovery slot. */
const admissionStoredReviewIntentSchema = z.union([admissionReviewIntentSchema, admissionBatchReviewIntentSchema]) satisfies z.ZodType<AdmissionStoredReviewIntent>;
export const admissionStoredReviewRecordSchema = z.object({ viewerId: z.string().min(1), slug: z.string().min(1), pending: admissionStoredReviewIntentSchema });
