/** Owns one history page input boundary and safe public projection before React serialization. @module admission-review-history-page */
import "server-only";
import type { GetAdmissionReviewHistoryPageUseCase } from "../../application/use-cases/get-admission-review-history-page-use-case";
import type { AdmissionReviewHistoryPageState } from "../../application/results/admission-review-history-page-state";
import { admissionReviewHistoryPageInputSchema } from "../../constants/admission-review-history-page-input";
import { ADMISSION_REVIEW_HISTORY_NAVIGATION, admissionReviewHistoryPageStateSchema } from "../../constants/admission-review-history-page";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC } from "../../constants/admission-review-history-observability";
import { createAdmissionPageDiagnostics, loadAdmissionPageRead, unavailableAdmissionPage } from "./admission-page-diagnostics";

/**
 * @param input - Untrusted resolved framework params/query. @param open - Server-owned lazy composition after input validation.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns Own Spanish props without private cause, native session or historical metadata.
 */
export async function loadAdmissionReviewHistoryPageState(input: unknown, open: () => Promise<Pick<GetAdmissionReviewHistoryPageUseCase, "execute">>, requestHeaders?: Pick<Headers, "get">): Promise<AdmissionReviewHistoryPageState> {
  const parsed = admissionReviewHistoryPageInputSchema.safeParse(input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const diagnostics = createAdmissionPageDiagnostics(ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC.operation, requestHeaders, { metadata: { admissionRequestId: parsed.data.params.requestId } });
  return loadAdmissionPageRead({
    diagnostics, stateSchema: admissionReviewHistoryPageStateSchema, messages: ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC,
    read: async () => {
      const page = await open();
      const { [ADMISSION_REVIEW_HISTORY_NAVIGATION.cursorQuery]: cursor, ...filters } = parsed.data.query;
      return page.execute({ slug: parsed.data.params.slug, admissionRequestId: parsed.data.params.requestId, requestId: diagnostics.context.requestId, filters, ...(cursor ? { cursor } : {}) });
    },
  });
}
