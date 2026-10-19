/** Content skeleton while this admission page reads; the shared layout keeps the heading and sections on screen. @module allowlist-loading */
import { AdmissionPageSkeleton } from "@/components/academy-admissions/admission-page-skeleton";
import { ADMISSION_PAGES } from "@/src/modules/academy-admissions/constants/admission-sections";

/** @returns Placeholders and one loading announcement, without session, storage or clock access. */
export default function AllowlistLoading() {
  return <AdmissionPageSkeleton label={ADMISSION_PAGES.allowlist.loading} />;
}
