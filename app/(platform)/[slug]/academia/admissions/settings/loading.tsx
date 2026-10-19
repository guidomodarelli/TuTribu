/** Content skeleton while this admission page reads; the shared layout keeps the heading and sections on screen. @module admission-policy-loading */
import { AdmissionPageSkeleton } from "@/components/academy-admissions/admission-page-skeleton";
import { ADMISSION_PAGES } from "@/src/modules/academy-admissions/constants/admission-sections";

/** @returns Placeholders and one loading announcement, without session, storage or clock access. */
export default function AdmissionPolicyLoading() {
  return <AdmissionPageSkeleton label={ADMISSION_PAGES.policy.loading} />;
}
