/** Validates runtime selection before composing the authorized server page and guarding its public props. @module admission-notification-settings-page */
import "server-only";
import type { GetAdmissionNotificationSettingsPageUseCase } from "../../application/use-cases/get-admission-notification-settings-page-use-case";
import type { AdmissionNotificationSettingsPageState } from "../../application/results/admission-notification-settings-page-state";
import { admissionNotificationSettingsPageInputSchema, admissionNotificationSettingsPageStateSchema, ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND, ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG } from "../../constants/admission-notification-settings-page";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode  } from "@/src/modules/academy-admissions/constants/admission-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** @param input - Untrusted resolved framework params and query. @param open - Server-selected inward loader. @returns Only guarded current props or catalogued Spanish feedback. */
export async function loadAdmissionNotificationSettingsPageState(input: unknown, open: () => Promise<Pick<GetAdmissionNotificationSettingsPageUseCase, "execute">>): Promise<AdmissionNotificationSettingsPageState> {
  const failure = (code: AdmissionErrorCode): AdmissionNotificationSettingsPageState => ({ kind: ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND.unavailable, code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = admissionNotificationSettingsPageInputSchema.safeParse(input);
  if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  const logger = () => createServerLogger({ feature: ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG.feature, operation: ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG.operation, ...context });
  try {
    const result = await (await open()).execute({ slug: parsed.data.params.slug, requestId: context.requestId });
    if (!result.ok) {
      if (result.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || result.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) logger().error({ message: ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG.failed, metadata: { code: result.failure.code } });
      return failure(result.failure.code);
    }
    const guarded = admissionNotificationSettingsPageStateSchema.safeParse(result.value);
    if (guarded.success) return guarded.data;
    logger().error({ message: ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG.failed, metadata: { code: ADMISSION_ERROR_CODE.publicContractUnusable } });
    return failure(ADMISSION_ERROR_CODE.publicContractUnusable);
  } catch {
    logger().error({ message: ADMISSION_NOTIFICATION_SETTINGS_PAGE_LOG.failed, metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return failure(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
