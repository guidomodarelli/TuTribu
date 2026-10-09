"use client";
/** Persists reference-only contact recovery, never code, destination, credential, session or consent. @module admission-contact-intent */
import { z } from "zod";
import { ADMISSION_CONTACT_ACTION, ADMISSION_CONTACT_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/admission-contact-browser";

/** Resource references are canonical UUIDs; their presence never grants authority. */
const referenceSchema = z.uuid().transform((reference) => reference.toLowerCase());
/** Pending work is a local intent whose original registered state must be read from the server. */
export const admissionContactPendingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.issue), operationId: referenceSchema }),
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.verify), operationId: referenceSchema, challengeId: referenceSchema }),
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.resend), operationId: referenceSchema, challengeId: referenceSchema }),
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.sms), operationId: referenceSchema, challengeId: referenceSchema }),
  z.strictObject({ kind: z.literal(ADMISSION_CONTACT_ACTION.apply), operationId: referenceSchema, proofId: referenceSchema, expectedVersion: z.int().positive() }),
]);
/** No result, permission or plaintext destination can enter this durable record. */
const contactIntentSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), requestId: referenceSchema.nullable(), issuedOperationId: referenceSchema.nullable(), verifiedOperationId: referenceSchema.nullable(), pending: admissionContactPendingSchema.nullable() });
export type AdmissionContactPending = z.infer<typeof admissionContactPendingSchema>;
export type AdmissionContactIntent = z.infer<typeof contactIntentSchema>;

/** @param viewerId - Current native viewer id. @param slug - Validated tribe slug. @param requestId - Exact pending or initial flow. @returns A separate recovery key with no session/token material. */
export function admissionContactIntentKey(viewerId: string, slug: string, requestId: string | null): string {
  return `${ADMISSION_CONTACT_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}:${requestId ? encodeURIComponent(requestId.toLowerCase()) : ""}`;
}

/** @param viewerId - Current native viewer. @param slug - Current tribe. @param requestId - Own pending reference or initial presentation. @returns Only owned usable references; invalid/foreign data is removed. @throws When browser storage is unavailable, so a new write can remain blocked. */
export function readAdmissionContactIntent(viewerId: string, slug: string, requestId: string | null): AdmissionContactIntent | null {
  const key = admissionContactIntentKey(viewerId, slug, requestId), raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { window.sessionStorage.removeItem(key); return null; }
  const parsed = contactIntentSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug || parsed.data.requestId !== (requestId?.toLowerCase() ?? null)) { window.sessionStorage.removeItem(key); return null; }
  return parsed.data;
}

/** @param value - Reference-only original intent. @returns After validating and writing it; sensitive extra fields throw before storage. */
export function writeAdmissionContactIntent(value: AdmissionContactIntent): void {
  const record = contactIntentSchema.parse(value);
  window.sessionStorage.setItem(admissionContactIntentKey(record.viewerId, record.slug, record.requestId), JSON.stringify(record));
}
