/** Serves independent leader email configuration and its original confirmed operations without dispatch. @module admission-email-settings-route */
import { createAdmissionNotificationSettingsRequestModule } from "@/src/modules/setup";
import { createAdmissionNotificationSettingsHandlers } from "@/src/modules/notifications/infrastructure/api/admission-notification-settings-handlers";

/** @param request - Current native leader request. @param context - Framework tenant selection. @returns Minimal read-only current settings without recency, keys or initialization. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionNotificationSettingsHandlers(createAdmissionNotificationSettingsRequestModule).readEmailSettings(request, context);
}
/** @param request - Explicit confirmed original UUID/version/desired configuration. @param context - Framework tenant selection. @returns Original progress or historical confirmed outcome after current scoped reauthentication. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionNotificationSettingsHandlers(createAdmissionNotificationSettingsRequestModule).changeEmailSettings(request, context);
}
