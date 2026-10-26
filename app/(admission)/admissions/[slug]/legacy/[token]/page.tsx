/** Composes a historical arrival through the same read-only common admission owner. @module legacy-admission-page */
import { Suspense } from "react";
import type { Metadata } from "next";
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { loadAdmissionPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-page";
import { LegacyAdmissionContainer } from "./legacy-admission-container";
import Loading from "./loading";

/** Historical token URLs remain private navigation proposals. */
export const metadata: Metadata = { title: "Solicitud de ingreso", referrer: "no-referrer", robots: { index: false, follow: false } };

/** @param props - Native unresolved route input. @returns Current account/policy state; GET creates no request, code, payment or membership. */
async function LegacyAdmissionContent({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [resolvedParams, query] = await Promise.all([params, searchParams]);
  const state = await loadAdmissionPageState({ params: resolvedParams, query, mode: "legacy" }, async () => ({ page: (await createAdmissionRequestModules()).queries.page }));
  return <LegacyAdmissionContainer initialState={state} />;
}

/** @param props - Unresolved framework input. @returns A segment-owned boundary with deterministic initial markup. */
export default function LegacyAdmissionPage(props: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><LegacyAdmissionContent {...props} /></Suspense>;
}
