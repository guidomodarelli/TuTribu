/** Keeps admission runtime data inside this leaf's own Suspense, outside membership layout. @module admission-entry-page */
import { Suspense } from "react";
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { loadAdmissionPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-page";
import { AdmissionContainer } from "./admission-container";
import Loading from "./loading";

/** Loads one native safe initial snapshot; GET never submits, consumes or sends. */
async function AdmissionContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [resolvedParams, query] = await Promise.all([params, searchParams]);
  const state = await loadAdmissionPageState({ params: resolvedParams, query, mode: "entry" }, async () => ({ page: (await createAdmissionRequestModules()).queries.page }));
  return <AdmissionContainer key={state.kind === "ready" ? `${state.overview.tribe.slug}:${state.viewerId ?? "public"}` : state.code} initialState={state} />;
}

/** @param props - Unresolved framework runtime input. @returns Deterministic leaf fallback and a server-owned loader. */
export default function AdmissionPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><AdmissionContent {...props} /></Suspense>;
}
