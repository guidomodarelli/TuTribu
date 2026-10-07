"use client";
/** Stores only the current viewer's original reviewer decision for uncertainty recovery. @module admission-review-intent */
import { z } from "zod";
import { ADMISSION_REVIEW_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

/** Local storage is untrusted input; restoring an intention does not restore the user's UI confirmation. */
export const admissionReviewIntentSchema = z.object({ requestId: z.uuid(), input: z.strictObject({ operationId: z.uuid(), confirmed: z.literal(true), expectedVersion: z.int().positive(), decision: z.enum(ADMISSION_DECISION), internalReason: z.string().trim().min(1).max(ADMISSION_LIMIT.internalMessageCharacters), externalMessage: z.string().trim().max(ADMISSION_LIMIT.externalMessageCharacters).optional() }) });
const storedSchema = z.object({ viewerId: z.string().min(1), slug: z.string().min(1), pending: admissionReviewIntentSchema });
export type AdmissionReviewIntent = z.infer<typeof admissionReviewIntentSchema>;
/** @param viewerId - Native current account id. @param slug - Current validated tribe. @returns A tenant/account-local key, never a permission token. */
function reviewIntentKey(viewerId: string, slug: string): string { return `${ADMISSION_REVIEW_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`; }
/** @param viewerId - Native current account. @param slug - Current tribe. @returns Original scoped local intent or absence; invalid/foreign input never reaches a writer. */
export function readAdmissionReviewIntent(viewerId: string, slug: string): AdmissionReviewIntent | null {
  const key = reviewIntentKey(viewerId, slug), raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { window.sessionStorage.removeItem(key); return null; }
  const parsed = storedSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug) { window.sessionStorage.removeItem(key); return null; }
  return parsed.data.pending;
}
/** @param viewerId - Native scoped viewer. @param slug - Current tribe. @param pending - Original immutable intention or confirmed removal. @returns Only after successful browser persistence; failure prevents a new mutation. */
export function writeAdmissionReviewIntent(viewerId: string, slug: string, pending: AdmissionReviewIntent | null): void {
  const key = reviewIntentKey(viewerId, slug);
  if (!pending) { window.sessionStorage.removeItem(key); return; }
  window.sessionStorage.setItem(key, JSON.stringify(storedSchema.parse({ viewerId, slug, pending })));
}
