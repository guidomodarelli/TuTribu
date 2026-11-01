/** Validates the single activity SSR entrypoint before opening native read composition. @module admission-activity-page */
import "server-only";
import type { GetAdmissionActivityPageUseCase } from "../../application/use-cases/get-admission-activity-page-use-case";
import type { AdmissionActivityPageState } from "../../application/results/admission-activity-page-state";
import { admissionActivityPageInputSchema, admissionActivityReadyPageStateSchema } from "../../constants/admission-activity-page-schemas";
import { ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC } from "../../constants/admission-activity-browser";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { createAdmissionPageDiagnostics, loadAdmissionPageRead, unavailableAdmissionPage } from "./admission-page-diagnostics";

/** Fixed messages of the activity loader; the closed code and cause chain tell the failures apart. */
const ADMISSION_ACTIVITY_PAGE_MESSAGES = { readFailed: ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.message, contractRejected: ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.message, loadFailed: ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.message } as const;

/**
 * @param input - Untrusted runtime route/query only. @param open - Server-selected inward page use case.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns Safe leader props or closed Spanish failure with no partial private data.
 */
export async function loadAdmissionActivityPageState(input: unknown, open: () => Promise<Pick<GetAdmissionActivityPageUseCase, "execute">>, requestHeaders?: Pick<Headers, "get">): Promise<AdmissionActivityPageState> {
  const parsed = admissionActivityPageInputSchema.safeParse(input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const diagnostics = createAdmissionPageDiagnostics(ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.load, requestHeaders, { feature: ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.feature });
  return loadAdmissionPageRead({
    diagnostics, stateSchema: admissionActivityReadyPageStateSchema, messages: ADMISSION_ACTIVITY_PAGE_MESSAGES,
    read: async () => (await open()).execute({ slug: parsed.data.params.slug, requestId: diagnostics.context.requestId, filters: parsed.data.query }),
  });
}
