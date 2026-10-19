/** Loads own preferences and authorized leader email configuration behind this leaf's runtime boundary. @module admission-notification-settings-route */
import { Suspense } from "react";
import { createAdmissionNotificationSettingsRequestModule } from "@/src/modules/setup";
import { loadAdmissionNotificationSettingsPageState } from "@/src/modules/notifications/infrastructure/composition/admission-notification-settings-page";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND as PAGE_KIND } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { AdmissionNotificationSettingsContainer } from "./notification-settings-container";
import { ADMISSION_SECTION, ADMISSION_SECTION_AUDIENCE } from "@/src/modules/academy-admissions/constants/admission-sections";
import Loading from "./loading";

/** @param props - Unresolved runtime input consumed only inside the leaf's Suspense scope. @returns One guarded SSR snapshot and current role-specific navigation. */
async function NotificationSettingsContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const state = await loadAdmissionNotificationSettingsPageState({ params: route, query }, async () => (await createAdmissionNotificationSettingsRequestModule()).page);
  const key = state.kind === PAGE_KIND.ready ? `${state.slug}:${state.viewerId}` : state.code;
  const ready = state.kind === PAGE_KIND.ready ? state : null;
  return <AdmissionSettingsPage title="Avisos de admisión" description="Elegí cómo recibir los avisos de nuevas solicitudes." section={ADMISSION_SECTION.notifications} slug={ready?.slug} audience={ready?.canConfigureEmail ? ADMISSION_SECTION_AUDIENCE.leader : ADMISSION_SECTION_AUDIENCE.reviewer}><AdmissionNotificationSettingsContainer key={key} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Native framework route input. @returns A deterministic leaf skeleton and the server data entrypoint. */
export default function AdmissionNotificationSettingsPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><NotificationSettingsContent {...props} /></Suspense>;
}
