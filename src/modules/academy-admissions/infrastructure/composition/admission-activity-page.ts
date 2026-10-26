/** Validates the single activity SSR entrypoint before opening native read composition. @module admission-activity-page */
import "server-only";
import type { GetAdmissionActivityPageUseCase } from "../../application/use-cases/get-admission-activity-page-use-case";
import type { AdmissionActivityPageState } from "../../application/results/admission-activity-page-state";
import { admissionActivityPageInputSchema, admissionActivityReadyPageStateSchema } from "../../constants/admission-activity-page-schemas";
import { ADMISSION_ACTIVITY_PAGE_KIND, ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC } from "../../constants/admission-activity-browser";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { resolvePrivateRequestContext } from "@/src/modules/shared/infrastructure/observability/private-request-context";

/** @param input - Untrusted runtime route/query only. @param open - Server-selected inward page use case. @returns Safe leader props or closed Spanish failure with no partial private data. */
export async function loadAdmissionActivityPageState(input: unknown, open: () => Promise<Pick<GetAdmissionActivityPageUseCase, "execute">>): Promise<AdmissionActivityPageState> {
  const unavailable = (code: AdmissionErrorCode): AdmissionActivityPageState => ({ kind: ADMISSION_ACTIVITY_PAGE_KIND.unavailable, code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = admissionActivityPageInputSchema.safeParse(input);
  if (!parsed.success) return unavailable(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolvePrivateRequestContext(new Headers());
  const report = (code: AdmissionErrorCode) => createServerLogger({ feature: ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.feature, operation: ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.load, ...context }).error({ message: ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.message, metadata: { code } });
  try {
    const page = await open();
    const result = await page.execute({ slug: parsed.data.params.slug, requestId: context.requestId, filters: parsed.data.query });
    if (!result.ok) {
      if (result.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || result.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) report(result.failure.code);
      return unavailable(result.failure.code);
    }
    const ownState = admissionActivityReadyPageStateSchema.safeParse(result.value);
    if (ownState.success) return ownState.data;
    report(ADMISSION_ERROR_CODE.publicContractUnusable);
    return unavailable(ADMISSION_ERROR_CODE.publicContractUnusable);
  } catch {
    report(ADMISSION_ERROR_CODE.unexpectedFailure);
    return unavailable(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
