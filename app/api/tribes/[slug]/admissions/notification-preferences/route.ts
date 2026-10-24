/** Serves and changes only the current reviewer's own admission email frequency. @module admission-notification-preferences-route */
import { createAdmissionNotificationSettingsRequestModule } from "@/src/modules/setup";
import { createAdmissionNotificationSettingsHandlers } from "@/src/modules/notifications/infrastructure/api/admission-notification-settings-handlers";

/** @param request - Current native request. @param context - Framework tenant selection. @returns A safe own default or stored choice without initializing or enabling email. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionNotificationSettingsHandlers(createAdmissionNotificationSettingsRequestModule).readOwnPreference(request, context);
}
/** @param request - Explicit same-origin mode/version request. @param context - Framework tenant selection. @returns A minimal own change/no-op or explicit version conflict without a full page refresh. */
export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionNotificationSettingsHandlers(createAdmissionNotificationSettingsRequestModule).changeOwnPreference(request, context);
}
