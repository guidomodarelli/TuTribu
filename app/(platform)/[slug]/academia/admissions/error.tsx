"use client";
/** Shows safe retry feedback for this leaf without exposing framework diagnostics. @module admission-review-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
/** @param props - Native framework retry callback. @returns Spanish recovery feedback with no raw error. */
export default function AdmissionReviewError({ retry }: { retry: () => void }) { return <AdmissionSettingsPage page="review"><AdmissionRouteError embedded message={ADMISSION_REVIEW_UI_COPY.readFailed} retry={retry} /></AdmissionSettingsPage>; }
