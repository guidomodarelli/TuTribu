/** Content skeleton while this admission page reads; the shared layout keeps the heading and sections on screen. @module admission-review-history-loading */
import { AdmissionPageSkeleton } from "@/components/academy-admissions/admission-page-skeleton";
import { ADMISSION_PAGES } from "@/src/modules/academy-admissions/constants/admission-sections";

/** @returns Placeholders and one loading announcement, without session, storage or clock access. */
export default function AdmissionReviewHistoryLoading() {
  return <AdmissionPageSkeleton label={ADMISSION_PAGES.history.loading} />;
}
