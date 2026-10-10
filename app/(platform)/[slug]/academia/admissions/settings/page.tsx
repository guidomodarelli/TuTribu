/** Loads current policy through one native server entrypoint inside the leaf runtime boundary. @module admission-policy-settings-page */
import { Suspense } from "react";
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { loadAdmissionPolicyPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-policy-page";
import { AdmissionPolicyContainer } from "./policy-container";
import Loading from "./loading";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { ALLOWLIST_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { PERSONAL_INVITATION_MANAGEMENT_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/personal-invitation-management-page";

/** @param props - Runtime input resolved only within the settings segment boundary. @returns Safe current leader props without provider/session payloads. */
async function PolicyContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = await loadAdmissionPolicyPageState({ params: route, query }, async () => (await createAdmissionRequestModules()).policyPage);
  const key = state.kind === "ready" ? `${state.slug}:${state.viewerId}` : state.code;
  const links = state.kind === "ready" ? [{ href: `/${encodeURIComponent(state.slug)}/${ALLOWLIST_SETTINGS_SEGMENT}`, label: "Gestionar lista de habilitados" }, { href: `/${encodeURIComponent(state.slug)}/${PERSONAL_INVITATION_MANAGEMENT_SETTINGS_SEGMENT}`, label: "Gestionar invitaciones personales" }] : [];
  return <AdmissionSettingsPage links={links}><AdmissionPolicyContainer key={key} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework runtime input. @returns Deterministic server skeleton and the current policy loader. */
export default function AdmissionPolicySettingsPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><PolicyContent {...props} /></Suspense>;
}
