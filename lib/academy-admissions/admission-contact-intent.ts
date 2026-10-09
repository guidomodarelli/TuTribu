"use client";
/** Persists reference-only contact recovery, never code, destination, credential, session or consent. @module admission-contact-intent */
import type { z } from "zod";
import { ADMISSION_CONTACT_STORAGE_PREFIX, ADMISSION_PERSONAL_CONTACT_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { admissionContactIntentSchema, admissionContactPendingSchema } from "@/src/modules/academy-admissions/constants/admission-contact-intent-schemas";
export { admissionContactPendingSchema } from "@/src/modules/academy-admissions/constants/admission-contact-intent-schemas";

export type AdmissionContactPending = z.infer<typeof admissionContactPendingSchema>;
export type AdmissionContactIntent = z.infer<typeof admissionContactIntentSchema>;

/** @param viewerId - Current native viewer id. @param slug - Validated tribe slug. @param requestId - Exact pending or initial flow. @param personalScope - Non-recoverable proposal digest when this is personal. @returns A separate recovery key with no session/token material. */
export function admissionContactIntentKey(viewerId: string, slug: string, requestId: string | null, personalScope?: string): string {
  const prefix = personalScope ? ADMISSION_PERSONAL_CONTACT_STORAGE_PREFIX : ADMISSION_CONTACT_STORAGE_PREFIX;
  return `${prefix}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}:${requestId ? encodeURIComponent(requestId.toLowerCase()) : ""}${personalScope ? `:${encodeURIComponent(personalScope)}` : ""}`;
}

/** @param viewerId - Current native viewer. @param slug - Current tribe. @param requestId - Own pending reference or initial presentation. @param personalScope - Exact personal proposal digest, never token material. @returns Only owned usable references; invalid/foreign data is removed. @throws When browser storage is unavailable, so a new write can remain blocked. */
export function readAdmissionContactIntent(viewerId: string, slug: string, requestId: string | null, personalScope?: string): AdmissionContactIntent | null {
  const key = admissionContactIntentKey(viewerId, slug, requestId, personalScope), raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { window.sessionStorage.removeItem(key); return null; }
  const parsed = admissionContactIntentSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug || parsed.data.requestId !== (requestId?.toLowerCase() ?? null) || parsed.data.personalScope !== personalScope) { window.sessionStorage.removeItem(key); return null; }
  return parsed.data;
}

/** @param value - Reference-only original intent. @returns After validating and writing it; sensitive extra fields throw before storage. */
export function writeAdmissionContactIntent(value: AdmissionContactIntent): void {
  const record = admissionContactIntentSchema.parse(value);
  window.sessionStorage.setItem(admissionContactIntentKey(record.viewerId, record.slug, record.requestId, record.personalScope), JSON.stringify(record));
}
