/** Loads the existing current leader policy once for a new explicit CSV import surface. @module allowlist-import-page-route */
import { Suspense } from "react";
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { loadAdmissionPolicyPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-policy-page";
import { presentAllowlistImportPage } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { ALLOWLIST_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { AllowlistImportContainer } from "../allowlist-import-container";
import Loading from "./loading";

/** @param props - Runtime data resolved inside the leaf's own boundary. @returns Guarded minimum scope without initial client policy refetch or mutation. */
async function ImportContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = presentAllowlistImportPage(await loadAdmissionPolicyPageState({ params: route, query }, async () => (await createAllowlistRequestModule()).policyPage));
  const links = state.kind === "ready" ? [{ href: `/${encodeURIComponent(state.slug)}/${ALLOWLIST_SETTINGS_SEGMENT}`, label: "Volver a la lista de habilitados" }] : [];
  return <AdmissionSettingsPage title="Importar habilitados desde CSV" links={links}><AllowlistImportContainer key={state.kind === "ready" ? `${state.slug}:${state.viewerId}` : state.code} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved native route/query values. @returns Deterministic server skeleton and the current authorized primary read. */
export default function AllowlistImportPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <Suspense fallback={<Loading />}><ImportContent {...props} /></Suspense>; }
