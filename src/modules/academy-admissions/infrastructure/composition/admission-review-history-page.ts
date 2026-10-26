/** Owns one history page input boundary and safe public projection before React serialization. @module admission-review-history-page */
import "server-only";
import type { GetAdmissionReviewHistoryPageUseCase } from "../../application/use-cases/get-admission-review-history-page-use-case";
import type { AdmissionReviewHistoryPageState } from "../../application/results/admission-review-history-page-state";
import { admissionReviewHistoryPageInputSchema } from "../../constants/admission-review-history-page-input";
import { ADMISSION_REVIEW_HISTORY_NAVIGATION, admissionReviewHistoryPageStateSchema } from "../../constants/admission-review-history-page";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC } from "../../constants/admission-review-history-observability";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** @param input - Untrusted resolved framework params/query. @param open - Server-owned lazy composition after input validation. @returns Own Spanish props without private cause, native session or historical metadata. */
export async function loadAdmissionReviewHistoryPageState(input: unknown, open: () => Promise<Pick<GetAdmissionReviewHistoryPageUseCase, "execute">>): Promise<AdmissionReviewHistoryPageState> {
  const failure = (code: AdmissionErrorCode): AdmissionReviewHistoryPageState => ({ kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = admissionReviewHistoryPageInputSchema.safeParse(input);
  if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  const logger = createServerLogger({ feature: ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC.feature, operation: ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC.operation, ...context });
  try {
    const page = await open();
    const { [ADMISSION_REVIEW_HISTORY_NAVIGATION.cursorQuery]: cursor, ...filters } = parsed.data.query;
    const result = await page.execute({ slug: parsed.data.params.slug, admissionRequestId: parsed.data.params.requestId, requestId: context.requestId, filters, ...(cursor ? { cursor } : {}) });
    if (!result.ok) {
      if (result.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || result.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) logger.error({ message: ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC.readFailed, metadata: { code: result.failure.code, admissionRequestId: parsed.data.params.requestId } });
      return failure(result.failure.code);
    }
    const projected = admissionReviewHistoryPageStateSchema.safeParse(result.value);
    if (projected.success) return projected.data;
    logger.error({ message: ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC.contractRejected, metadata: { code: ADMISSION_ERROR_CODE.publicContractUnusable, admissionRequestId: parsed.data.params.requestId } });
    return failure(ADMISSION_ERROR_CODE.publicContractUnusable);
  } catch {
    logger.error({ message: ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC.compositionFailed, metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure, admissionRequestId: parsed.data.params.requestId } });
    return failure(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
