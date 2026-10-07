/** Uses one current reviewer loader behind this leaf's runtime Suspense boundary. @module admission-review-page */
import { Suspense } from "react";
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { loadAdmissionReviewPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-review-page";
import { AdmissionReviewRouteContainer } from "./admission-review-route-container";
import Loading from "./loading";

/** @param props - Runtime route selection resolved inside the leaf boundary. @returns Only safe current authorized reviewer props. */
async function ReviewContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = await loadAdmissionReviewPageState({ params: route, query }, async () => { const modules = await createAdmissionRequestModules(); return modules.reviews.createPage(modules.queries.resolveTribe); });
  return <AdmissionReviewRouteContainer initialState={state} />;
}
/** @param props - Unresolved framework runtime input. @returns A deterministic own leaf skeleton and server loader. */
export default function AdmissionReviewPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><ReviewContent {...props} /></Suspense>;
}
