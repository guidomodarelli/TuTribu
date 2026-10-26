"use client";
/** Owns safe history leaf render recovery without exposing the runtime error. @module admission-review-history-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";

/** @param props - Framework-owned retry callback; the private runtime exception is never displayed. @returns Recovery inside the existing platform main with one page heading. */
export default function AdmissionReviewHistoryError({ retry }: { retry: () => void }) {
  return <AdmissionSettingsPage page="history"><AdmissionRouteError embedded retry={retry} /></AdmissionSettingsPage>;
}
