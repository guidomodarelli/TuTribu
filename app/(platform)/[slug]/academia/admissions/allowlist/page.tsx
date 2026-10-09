/** Loads the list through one server entrypoint inside this leaf's own runtime boundary. @module allowlist-page-route */
import { Suspense } from "react";
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { loadAllowlistPageState } from "@/src/modules/academy-admissions/infrastructure/composition/allowlist-page";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { AllowlistContainer } from "./allowlist-container";
import Loading from "./loading";
import { ALLOWLIST_IMPORT_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";

/** @param props - Runtime values resolved within the leaf Suspense scope. @returns Guarded current leader props without native session or provider payloads. */
async function ListContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = await loadAllowlistPageState({ params: route, query }, async () => (await createAllowlistRequestModule()).page);
  const links = state.kind === "ready" ? [{ href: `/${encodeURIComponent(state.slug)}/${ALLOWLIST_IMPORT_SETTINGS_SEGMENT}`, label: "Importar habilitados desde CSV" }, { href: `/${encodeURIComponent(state.slug)}/academia/admissions/settings`, label: "Configuración de admisión" }, { href: `/${encodeURIComponent(state.slug)}/academia/admissions`, label: "Revisar solicitudes" }] : [];
  return <AdmissionSettingsPage title="Lista de habilitados" links={links}><AllowlistContainer key={state.kind === "ready" ? `${state.slug}:${state.viewerId}` : state.code} initialState={state} /></AdmissionSettingsPage>;
}

/** @param props - Unresolved framework params/search values. @returns Deterministic own loading and the current primary data entrypoint. */
export default function AllowlistPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><ListContent {...props} /></Suspense>;
}
