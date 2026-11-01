/** Validates runtime selection before composing the authorized server page and guarding its public props. @module admission-notification-settings-page */
import "server-only";
import type { GetAdmissionNotificationSettingsPageUseCase } from "../../application/use-cases/get-admission-notification-settings-page-use-case";
import type { AdmissionNotificationSettingsPageState } from "../../application/results/admission-notification-settings-page-state";
import { admissionNotificationSettingsPageInputSchema, admissionNotificationSettingsPageStateSchema, ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG } from "../../constants/admission-notification-settings-page";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { createAdmissionPageDiagnostics, loadAdmissionPageRead, unavailableAdmissionPage } from "@/src/modules/academy-admissions/infrastructure/composition/admission-page-diagnostics";

/**
 * @param input - Untrusted resolved framework params and query. @param open - Server-selected inward loader.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns Only guarded current props or catalogued Spanish feedback.
 */
export async function loadAdmissionNotificationSettingsPageState(input: unknown, open: () => Promise<Pick<GetAdmissionNotificationSettingsPageUseCase, "execute">>, requestHeaders?: Pick<Headers, "get">): Promise<AdmissionNotificationSettingsPageState> {
  const parsed = admissionNotificationSettingsPageInputSchema.safeParse(input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const diagnostics = createAdmissionPageDiagnostics(ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG.operation, requestHeaders, { feature: ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG.feature });
  return loadAdmissionPageRead({
    diagnostics, stateSchema: admissionNotificationSettingsPageStateSchema, messages: ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG,
    read: async () => (await open()).execute({ slug: parsed.data.params.slug, requestId: diagnostics.context.requestId }),
  });
}
