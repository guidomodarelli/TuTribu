/** Resolves personal SSR runtime data within this leaf's own Suspense and safe application composition. @module personal-invitation-page */
import { Suspense } from "react";
import type { Metadata } from "next";
import { createPersonalInvitationRequestModule } from "@/src/modules/setup";
import { loadPersonalInvitationPageState } from "@/src/modules/academy-admissions/infrastructure/composition/personal-invitation-page";
import { PersonalInvitationContainer } from "./personal-invitation-container";
import Loading from "./loading";

/** Private proposal links cannot be indexed or used as navigation referrers. */
export const metadata: Metadata = { title: "Invitación personal", referrer: "no-referrer", robots: { index: false, follow: false } };

/** @param props - Unresolved native params/query. @returns One read-only snapshot without serializing the token as a container prop. */
async function PersonalInvitationContent({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [resolvedParams, query] = await Promise.all([params, searchParams]);
  const state = await loadPersonalInvitationPageState({ params: resolvedParams, query }, createPersonalInvitationRequestModule);
  return <PersonalInvitationContainer initialState={state} />;
}

/** @param props - Native unresolved runtime input. @returns Instant deterministic fallback and server-owned read-only content. */
export default function PersonalInvitationPage(props: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><PersonalInvitationContent {...props} /></Suspense>;
}
