/** Loads current policy and preflight through native server entrypoints inside the leaf runtime boundary. @module admission-policy-settings-page */
import { headers } from "next/headers";
import { Suspense } from "react";
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { loadAdmissionPolicyPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-policy-page";
import { loadAdmissionPreflightState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-preflight-page";
import { readAdmissionSettingsNavigation } from "@/src/modules/academy-admissions/constants/admission-settings-navigation";
import { AdmissionPolicyContainer } from "./policy-container";
import Loading from "./loading";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";

/** @param props - Runtime input resolved only within the settings segment boundary. @returns Safe current leader props without provider/session payloads. */
async function PolicyContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, rawQuery, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const { navigation, query } = readAdmissionSettingsNavigation(rawQuery);
  const modules = createAdmissionRequestModules();
  const [state, preflight] = await Promise.all([
    loadAdmissionPolicyPageState({ params: route, query }, async () => (await modules).policyPage, requestHeaders),
    loadAdmissionPreflightState({ params: route }, async () => { const opened = await modules; return { resolveTribe: opened.queries.resolveTribe, preflight: opened.policyPreflight }; }, requestHeaders),
  ]);
  const key = state.kind === "ready" ? `${state.slug}:${state.viewerId}` : state.code;
  return <AdmissionSettingsPage page="policy"><AdmissionPolicyContainer key={key} initialState={state} initialPreflight={preflight} entryStep={navigation.step} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework runtime input. @returns Deterministic server skeleton and the current policy loader. */
export default function AdmissionPolicySettingsPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><PolicyContent {...props} /></Suspense>;
}
