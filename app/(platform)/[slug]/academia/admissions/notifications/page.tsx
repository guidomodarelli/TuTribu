/** Loads own preferences and authorized leader email configuration behind this leaf's runtime boundary. @module admission-notification-settings-route */
import { headers } from "next/headers";
import { Suspense } from "react";
import { createAdmissionNotificationSettingsRequestModule } from "@/src/modules/setup";
import { loadAdmissionNotificationSettingsPageState } from "@/src/modules/notifications/infrastructure/composition/admission-notification-settings-page";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { AdmissionNotificationSettingsGate } from "./notification-settings-gate";
import Loading from "./loading";

/**
 * @param props - Unresolved runtime input consumed only inside the leaf's Suspense scope.
 * @returns One guarded SSR snapshot and current role-specific navigation: the notices form, or the prerequisite it still needs.
 */
async function NotificationSettingsContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const state = await loadAdmissionNotificationSettingsPageState({ params: route, query }, async () => (await createAdmissionNotificationSettingsRequestModule()).page, requestHeaders);
  return <AdmissionSettingsPage page="notifications"><AdmissionNotificationSettingsGate initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Native framework route input. @returns A deterministic leaf skeleton and the server data entrypoint. */
export default function AdmissionNotificationSettingsPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><NotificationSettingsContent {...props} /></Suspense>;
}
