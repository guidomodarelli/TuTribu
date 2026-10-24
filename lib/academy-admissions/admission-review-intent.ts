"use client";
/** Stores only the current viewer's original reviewer decision for uncertainty recovery. @module admission-review-intent */
import { ADMISSION_REVIEW_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { admissionStoredReviewRecordSchema } from "@/src/modules/academy-admissions/constants/admission-review-intent-schemas";
import type { AdmissionStoredReviewIntent } from "@/src/modules/academy-admissions/application/results/admission-review-intent";
export { admissionReviewIntentSchema, admissionBatchReviewIntentSchema } from "@/src/modules/academy-admissions/constants/admission-review-intent-schemas";
export type { AdmissionReviewIntent, AdmissionBatchReviewIntent, AdmissionBatchReviewSelection, AdmissionStoredReviewIntent } from "@/src/modules/academy-admissions/application/results/admission-review-intent";

/** @param viewerId - Native current account id. @param slug - Current validated tribe. @returns A tenant/account-local key, never a permission token. */
function reviewIntentKey(viewerId: string, slug: string): string { return `${ADMISSION_REVIEW_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`; }
/** @param viewerId - Native current account. @param slug - Current tribe. @returns Original scoped local intent or absence; invalid/foreign input never reaches a writer. */
export function readAdmissionReviewIntent(viewerId: string, slug: string): AdmissionStoredReviewIntent | null {
  const key = reviewIntentKey(viewerId, slug), raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { window.sessionStorage.removeItem(key); return null; }
  const parsed = admissionStoredReviewRecordSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug) { window.sessionStorage.removeItem(key); return null; }
  return parsed.data.pending;
}
/** @param viewerId - Native scoped viewer. @param slug - Current tribe. @param pending - Original immutable intention or confirmed removal. @returns Only after successful browser persistence; failure prevents a new mutation. */
export function writeAdmissionReviewIntent(viewerId: string, slug: string, pending: AdmissionStoredReviewIntent | null): void {
  const key = reviewIntentKey(viewerId, slug);
  if (!pending) { window.sessionStorage.removeItem(key); return; }
  window.sessionStorage.setItem(key, JSON.stringify(admissionStoredReviewRecordSchema.parse({ viewerId, slug, pending })));
}
