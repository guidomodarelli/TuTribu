/** Loads the private activity view through one current server entrypoint below the leaf runtime boundary. @module admission-activity-page */
import { Suspense } from "react";
import { createAdmissionActivityRequestModule } from "@/src/modules/setup";
import { loadAdmissionActivityPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-activity-page";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { ADMISSION_ACTIVITY_PAGE_KIND } from "@/src/modules/academy-admissions/constants/admission-activity-browser";
import { AdmissionActivityContainer } from "./admission-activity-container";
import Loading from "./loading";

/** @param props - Runtime routing resolved inside this segment's Suspense. @returns Only current leader-authorized own props, never a loopback request or implicit write. */
async function ActivityContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = await loadAdmissionActivityPageState({ params: route, query }, async () => (await createAdmissionActivityRequestModule()).createPage());
  const key = state.kind === ADMISSION_ACTIVITY_PAGE_KIND.ready ? `${state.slug}:${state.viewerId}:${state.renderedAt}` : state.code;
  return <AdmissionSettingsPage><AdmissionActivityContainer key={key} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework routing. @returns An own leaf fallback and the single private SSR loader. */
export default function AdmissionActivityPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><ActivityContent {...props} /></Suspense>;
}
