/** Preserves the chronological order of validated ISO instants beyond JavaScript Date precision. @module admission-review-date-range */
import { ADMISSION_REVIEW_DATE_COMPARISON } from "../../constants/admission-review-dates";

/** @param from - Boundary-validated inclusive ISO start. @param until - Boundary-validated inclusive ISO end. @returns True for ascending or equivalent instants, retaining fractional precision and explicit offsets. */
export function areAdmissionReviewInstantsOrdered(from: string, until: string): boolean {
  const fromMilliseconds = Date.parse(from), untilMilliseconds = Date.parse(until);
  if (fromMilliseconds !== untilMilliseconds) return fromMilliseconds < untilMilliseconds;
  const fromRemainder = (ADMISSION_REVIEW_DATE_COMPARISON.fractionPattern.exec(from)?.[1] ?? "").slice(ADMISSION_REVIEW_DATE_COMPARISON.millisecondFractionDigits);
  const untilRemainder = (ADMISSION_REVIEW_DATE_COMPARISON.fractionPattern.exec(until)?.[1] ?? "").slice(ADMISSION_REVIEW_DATE_COMPARISON.millisecondFractionDigits);
  const precision = Math.max(fromRemainder.length, untilRemainder.length);
  return fromRemainder.padEnd(precision, "0") <= untilRemainder.padEnd(precision, "0");
}
