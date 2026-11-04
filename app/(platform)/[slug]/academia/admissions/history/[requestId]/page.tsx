/** Resolves private history runtime data inside this leaf's own Suspense boundary. @module admission-review-history-page */
import { headers } from "next/headers";
import { Suspense } from "react";
import { createAdmissionReviewHistoryRequestModule } from "@/src/modules/setup";
import { loadAdmissionReviewHistoryPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-review-history-page";
import { AdmissionReviewHistoryContainer } from "./history-container";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import Loading from "./loading";

/** Runtime input remains unresolved above the segment's own Suspense. */
type HistoryPageProps = { params: Promise<{ slug: string; requestId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** @param props - Untrusted framework runtime params and query. @returns Guarded current history props after the single lazy input boundary. */
async function HistoryContent({ params, searchParams }: HistoryPageProps) {
  const [route, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const state = await loadAdmissionReviewHistoryPageState({ params: route, query }, async () => (await createAdmissionReviewHistoryRequestModule()).page, requestHeaders);
  return <AdmissionSettingsPage page="history"><AdmissionReviewHistoryContainer initialState={state} /></AdmissionSettingsPage>;
}

/** @param props - Unresolved runtime input. @returns A deterministic own loading boundary around the current server read. */
export default function AdmissionReviewHistoryPage(props: HistoryPageProps) {
  return <Suspense fallback={<Loading />}><HistoryContent {...props} /></Suspense>;
}
