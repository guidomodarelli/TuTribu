/** Resolves an exact own request outside community membership, below this leaf's Suspense. @module own-admission-page */
import { headers } from "next/headers";
import type { Metadata } from "next";
import { Suspense } from "react";
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { loadAdmissionPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-page";
import { RequestContainer } from "./request-container";
import Loading from "./loading";

/** A private request link is never indexed nor sent as a navigation referrer. */
export const metadata: Metadata = { title: "Tu solicitud de ingreso", referrer: "no-referrer", robots: { index: false, follow: false } };

/** Runtime query/account work belongs to the page segment being rendered. */
async function RequestContent({ params, searchParams }: { params: Promise<{ requestId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [resolvedParams, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const state = await loadAdmissionPageState({ params: resolvedParams, query, mode: "request" }, async () => ({ page: (await createAdmissionRequestModules()).queries.page }), requestHeaders);
  return <RequestContainer key={state.kind === "ready" ? `${state.overview.tribe.slug}:${state.viewerId}:${state.request?.id}` : state.code} initialState={state} requestPage />;
}

/** @param props - Unresolved exact resource and tribe lookup. @returns A deterministic fallback and safe own loader. */
export default function RequestPage(props: { params: Promise<{ requestId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><RequestContent {...props} /></Suspense>;
}
