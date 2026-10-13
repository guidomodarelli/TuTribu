/** Loads current private management props inside this leaf's own runtime boundary. @module personal-invitation-management-page-route */
import { Suspense } from "react";
import { createPersonalInvitationManagementRequestModule } from "@/src/modules/setup";
import { loadPersonalInvitationManagementPageState } from "@/src/modules/academy-admissions/infrastructure/composition/personal-invitation-management-page";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { InvitationsContainer } from "./invitations-container";
import Loading from "./loading";

/** @param props - Runtime values resolved within this leaf. @returns Only guarded current leader props, with no session or token material. */
async function InvitationContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = await loadPersonalInvitationManagementPageState({ params: route, query }, async () => { const services = await createPersonalInvitationManagementRequestModule(); return { execute: services.page.execute.bind(services.page), publicOrigin: services.publicOrigin }; });
  return <AdmissionSettingsPage title="Invitaciones personales"><InvitationsContainer key={state.kind === "ready" ? `${state.slug}:${state.viewerId}` : state.code} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved native runtime input. @returns Deterministic loading and the single SSR data entrypoint. */
export default function InvitationsPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <Suspense fallback={<Loading />}><InvitationContent {...props} /></Suspense>; }
