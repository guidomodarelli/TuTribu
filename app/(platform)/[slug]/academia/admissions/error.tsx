"use client";
/** Shows safe retry feedback for this leaf without exposing framework diagnostics. @module admission-review-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
/** @param props - Native framework reset callback. @returns Spanish recovery feedback with no raw error. */
export default function AdmissionReviewError({ reset }: { reset: () => void }) { return <AdmissionRouteError message={ADMISSION_REVIEW_UI_COPY.readFailed} reset={reset} />; }
