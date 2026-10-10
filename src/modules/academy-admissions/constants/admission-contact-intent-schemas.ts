/** Owns strict reference-only browser recovery contracts for common and personal contact flows. @module admission-contact-intent-schemas */
import { z } from "zod";
import { ADMISSION_CONTACT_ACTION, ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN } from "./admission-contact-browser";

/** Resource references are canonical UUIDs and never grant authority. */
const contactReferenceSchema = z.uuid().transform((reference) => reference.toLowerCase());
/** Pending metadata points to original registry work, without code, destination or consent. */
export const admissionContactPendingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.issue), operationId: contactReferenceSchema }),
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.verify), operationId: contactReferenceSchema, challengeId: contactReferenceSchema }),
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.resend), operationId: contactReferenceSchema, challengeId: contactReferenceSchema }),
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.sms), operationId: contactReferenceSchema, challengeId: contactReferenceSchema }),
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.apply), operationId: contactReferenceSchema, proofId: contactReferenceSchema, expectedVersion: z.int().positive() }),
]);
/** No result, permission, token or plaintext destination can enter the durable record. */
export const admissionContactIntentSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), requestId: contactReferenceSchema.nullable(), issuedOperationId: contactReferenceSchema.nullable(), verifiedOperationId: contactReferenceSchema.nullable(), pending: admissionContactPendingSchema.nullable(), personalScope: z.string().regex(ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN).optional(), previousRequestId: contactReferenceSchema.optional() }).refine((record) => !record.previousRequestId || record.requestId === null && record.personalScope === undefined);
