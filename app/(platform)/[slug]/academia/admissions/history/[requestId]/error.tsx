"use client";
/** Owns safe history leaf render recovery without exposing the runtime error. @module admission-review-history-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { ADMISSION_REVIEW_HISTORY_COPY } from "@/src/modules/academy-admissions/constants/admission-review-history-page";

/** @param props - Framework-owned retry callback; the private runtime exception is never displayed. @returns Recovery inside the existing platform main with one page heading. */
export default function AdmissionReviewHistoryError({ reset }: { reset: () => void }) {
  return <AdmissionSettingsPage title={ADMISSION_REVIEW_HISTORY_COPY.title}><AdmissionRouteError embedded reset={reset} /></AdmissionSettingsPage>;
}
