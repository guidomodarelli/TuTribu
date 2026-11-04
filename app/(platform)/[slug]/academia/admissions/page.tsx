/** Uses one current reviewer loader behind this leaf's runtime Suspense boundary. @module admission-review-page */
import { Suspense } from "react";
import { headers } from "next/headers";
import { createAdmissionNotificationSettingsRequestModule, createAdmissionRequestModules, createMessagingConfigurationRequestModule } from "@/src/modules/setup";
import { loadAdmissionReviewPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-review-page";
import { reviewShowsPlatformNotice } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import { AdmissionReviewRouteContainer } from "./admission-review-route-container";
import Loading from "./loading";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { AdmissionSetupGuide } from "@/components/academy-admissions/admission-setup-guide";
import { AdmissionSetupGuideFallback } from "@/components/academy-admissions/admission-setup-guide-fallback";
import { loadAdmissionSetupGuideState, type AdmissionSetupGuideState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-setup-guide-page";

/** @param route - Route slug only; each settings loader repeats its own leader check. @param requestHeaders - Incoming request headers, for native correlation. @returns The guide read, started before the review list so both load in parallel. */
function startSetupGuide(route: { slug: string }, requestHeaders: Pick<Headers, "get">): Promise<AdmissionSetupGuideState> {
  return loadAdmissionSetupGuideState({ params: route, query: {} }, {
    policy: async () => (await createAdmissionRequestModules()).policyPage,
    notifications: async () => (await createAdmissionNotificationSettingsRequestModule()).page,
    messaging: async () => (await createMessagingConfigurationRequestModule()).createSummaryPage(),
    preflight: async () => { const modules = await createAdmissionRequestModules(); return { resolveTribe: modules.queries.resolveTribe, preflight: modules.policyPreflight }; },
  }, requestHeaders);
}

/**
 * @param props - The guide read already in flight and whether the inbox below already explains the platform requirement.
 * @returns The leader's setup checklist, or nothing for other viewers or a finished setup.
 */
async function SetupGuideContent({ guide, omitsPlatformNotice }: { guide: Promise<AdmissionSetupGuideState>; omitsPlatformNotice: boolean }) {
  const state = await guide;
  return state ? <AdmissionSetupGuide slug={state.slug} progress={state.progress} omitsPlatformNotice={omitsPlatformNotice} /> : null;
}

/** @param props - Runtime route selection resolved inside the leaf boundary. @returns Only safe current authorized reviewer props. */
async function ReviewContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const guide = startSetupGuide(route, requestHeaders);
  const state = await loadAdmissionReviewPageState({ params: route, query }, async () => { const modules = await createAdmissionRequestModules(); return modules.reviews.createPage(modules.queries.resolveTribe); }, requestHeaders);
  return <AdmissionSettingsPage page="review"><Suspense fallback={<AdmissionSetupGuideFallback />}><SetupGuideContent guide={guide} omitsPlatformNotice={reviewShowsPlatformNotice(state)} /></Suspense><AdmissionReviewRouteContainer initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework runtime input. @returns A deterministic own leaf skeleton and server loader. */
export default function AdmissionReviewPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><ReviewContent {...props} /></Suspense>;
}
