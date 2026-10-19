/** Resolves private history runtime data inside this leaf's own Suspense boundary. @module admission-review-history-page */
import { Suspense } from "react";
import { createAdmissionReviewHistoryRequestModule } from "@/src/modules/setup";
import { loadAdmissionReviewHistoryPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-review-history-page";
import { AdmissionReviewHistoryContainer } from "./history-container";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { ADMISSION_REVIEW_HISTORY_COPY } from "@/src/modules/academy-admissions/constants/admission-review-history-page";
import { ADMISSION_SECTION, ADMISSION_SECTION_AUDIENCE } from "@/src/modules/academy-admissions/constants/admission-sections";
import Loading from "./loading";

/** Runtime input remains unresolved above the segment's own Suspense. */
type HistoryPageProps = { params: Promise<{ slug: string; requestId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** @param props - Untrusted framework runtime params and query. @returns Guarded current history props after the single lazy input boundary. */
async function HistoryContent({ params, searchParams }: HistoryPageProps) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = await loadAdmissionReviewHistoryPageState({ params: route, query }, async () => (await createAdmissionReviewHistoryRequestModule()).page);
  return <AdmissionSettingsPage title={ADMISSION_REVIEW_HISTORY_COPY.title} description={ADMISSION_REVIEW_HISTORY_COPY.description} section={ADMISSION_SECTION.review} slug={state.kind === "ready" ? state.slug : undefined} audience={ADMISSION_SECTION_AUDIENCE.reviewer}><AdmissionReviewHistoryContainer initialState={state} /></AdmissionSettingsPage>;
}

/** @param props - Unresolved runtime input. @returns A deterministic own loading boundary around the current server read. */
export default function AdmissionReviewHistoryPage(props: HistoryPageProps) {
  return <Suspense fallback={<Loading />}><HistoryContent {...props} /></Suspense>;
}
