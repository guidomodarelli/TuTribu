/** Page heading and content skeleton while this admission page reads; the shared layout keeps the section row on screen. @module admission-policy-loading */
import { AdmissionPageSkeleton } from "@/components/academy-admissions/admission-page-skeleton";

/** @returns The page heading, placeholders and one loading announcement, without session, storage or clock access. */
export default function AdmissionPolicyLoading() {
  return <AdmissionPageSkeleton page="policy" />;
}
