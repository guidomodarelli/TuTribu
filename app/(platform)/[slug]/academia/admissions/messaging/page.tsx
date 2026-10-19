/** Loads early usage through one native server entrypoint inside this leaf's runtime boundary. @module admission-messaging-settings-page */
import { Suspense } from "react";
import { createMessagingUsageRequestModule } from "@/src/modules/setup";
import { loadMessagingUsagePageState } from "@/src/modules/messaging/infrastructure/composition/messaging-usage-page";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { MessagingUsageContainer } from "./messaging-usage-container";
import { ADMISSION_SECTION, ADMISSION_SECTION_AUDIENCE } from "@/src/modules/academy-admissions/constants/admission-sections";
import Loading from "./loading";

/** @param props - Runtime params/query resolved only below the leaf Suspense. @returns Current own usage and deterministic localized choices, without a loopback read or initialization. */
async function MessagingContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = await loadMessagingUsagePageState({ params: route, query }, async () => (await createMessagingUsageRequestModule()).createPage());
  const key = state.kind === "ready" ? `${state.slug}:${state.viewerId}` : state.code;
  return <AdmissionSettingsPage title="Países y cupos de mensajería" description="Prepará el uso antes de conectar un canal o solicitar una prueba telefónica." section={ADMISSION_SECTION.usage} slug={state.kind === "ready" ? state.slug : undefined} audience={ADMISSION_SECTION_AUDIENCE.leader}><MessagingUsageContainer key={key} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework runtime inputs. @returns An own leaf skeleton and the single current server loader. */
export default function AdmissionMessagingSettingsPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <Suspense fallback={<Loading />}><MessagingContent {...props} /></Suspense>; }
